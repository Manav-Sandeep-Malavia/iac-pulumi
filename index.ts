import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as netmask from "netmask";

const config = new pulumi.Config();
const networkIP = config.require("VPC_IP")
const networkMask = config.require("VPC_CIDR_MASK")
const subnetMask = config.require("SUBNET_MASK")
const vpcname = config.require("vpcName")
const igwname = config.require("igwName")

const my_vpc = new aws.ec2.Vpc("my_vpc", {
    cidrBlock: networkIP+"/"+networkMask,
    instanceTenancy: "default",
    tags: {
        Name: vpcname,
    },
});

// Creating Internet Gateway for VPC
const app_igw = new aws.ec2.InternetGateway("app_igw", {
    vpcId: my_vpc.id,
    tags: {
        Name: igwname,
    },
});

const az = pulumi.output(aws.getAvailabilityZones());

const publicSubnets: aws.ec2.Subnet[] = [];
const privateSubnets: aws.ec2.Subnet[] = [];

const publicRT = new aws.ec2.RouteTable("publicRT", {
    vpcId: my_vpc.id,
    tags: {
        Name: "publicRT",
    },
});

const privateRT = new aws.ec2.RouteTable("privateRT", {
    vpcId: my_vpc.id,
    tags: {
        Name: "privateRT",
    },
});

const availableAZ = az.apply(az => az.names.slice(0, 3));
var block = new netmask.Netmask(networkIP+ "/" + subnetMask)

availableAZ.apply(azs => {
    azs.forEach((az, i) => {
        const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
            cidrBlock: block.toString(),
            vpcId: my_vpc.id,
            availabilityZone: az,
            tags: {
                Name: `public-subnet-${i}`,
            },
        });
        block = block.next()
        publicSubnets.push(publicSubnet);

        new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${i}`, {
            subnetId: publicSubnet.id,
            routeTableId: publicRT.id,
        });


        const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
            cidrBlock: `10.0.${i + 10}.0/24`,
            vpcId: my_vpc.id,
            availabilityZone: az,
            tags: {
                Name: `private-subnet-${i}`,
            },
        });
        block = block.next()
        privateSubnets.push(privateSubnet);

        new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${i}`, {
            subnetId: privateSubnet.id,
            routeTableId: privateRT.id,
        });
    });
});

new aws.ec2.Route("publicRoute", {
    routeTableId: publicRT.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: app_igw.id,
});