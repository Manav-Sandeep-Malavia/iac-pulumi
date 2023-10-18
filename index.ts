// import * as pulumi from "@pulumi/pulumi";
// import * as aws from "@pulumi/aws";
// import * as awsx from "@pulumi/awsx";
// import * as netmask from "netmask";

// const config = new pulumi.Config();
// const networkIP = config.require("VPC_IP")
// const networkMask = config.require("VPC_CIDR_MASK")
// const subnetMask = config.require("SUBNET_MASK")
// const vpcname = config.require("vpcName")
// const igwname = config.require("igwName")

// const my_vpc = new aws.ec2.Vpc("my_vpc", {
//     cidrBlock: networkIP+"/"+networkMask,
//     instanceTenancy: "default",
//     tags: {
//         Name: vpcname,
//     },
// });

// // Creating Internet Gateway for VPC
// const app_igw = new aws.ec2.InternetGateway("app_igw", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: igwname,
//     },
// });

// const az = pulumi.output(aws.getAvailabilityZones());

// const publicSubnets: aws.ec2.Subnet[] = [];
// const privateSubnets: aws.ec2.Subnet[] = [];

// const publicRT = new aws.ec2.RouteTable("publicRT", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: "publicRT",
//     },
// });

// const privateRT = new aws.ec2.RouteTable("privateRT", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: "privateRT",
//     },
// });

// const availableAZ = az.apply(az => az.names.slice(0, 3));
// var block = new netmask.Netmask(networkIP+ "/" + subnetMask)

// availableAZ.apply(azs => {
//     azs.forEach((az, i) => {
//         const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
//             cidrBlock: block.toString(),
//             vpcId: my_vpc.id,
//             availabilityZone: az,
//             tags: {
//                 Name: `public-subnet-${i}`,
//             },
//         });
//         block = block.next()
//         publicSubnets.push(publicSubnet);

//         new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${i}`, {
//             subnetId: publicSubnet.id,
//             routeTableId: publicRT.id,
//         });


//         const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
//             cidrBlock: block.toString(),
//             vpcId: my_vpc.id,
//             availabilityZone: az,
//             tags: {
//                 Name: `private-subnet-${i}`,
//             },
//         });
//         block = block.next()
//         privateSubnets.push(privateSubnet);

//         new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${i}`, {
//             subnetId: privateSubnet.id,
//             routeTableId: privateRT.id,
//         });
//     });
// });

// new aws.ec2.Route("publicRoute", {
//     routeTableId: publicRT.id,
//     destinationCidrBlock: "0.0.0.0/0",
//     gatewayId: app_igw.id,
// });

// const  webappSecurityGroup = new aws.ec2.SecurityGroup("webappSecurityGroup", {
//     description: "Web application security group",
//     ingress: [
//         { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"]},  // SSH
//         { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"]},  // HTTP
//         { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"]},  // HTTPS
        
//         { protocol: "tcp", fromPort: 3000, toPort: 3000, cidrBlocks: ["0.0.0.0/0"]},  // Your application port
//     ],
// });
// // Create an EC2 instance with the given inputs
// const ec2 = new aws.ec2.Instance("web-server", {
//     // Make sure to substitute this with your custom AMI
//     ami: "ami-0e0d574018df89af4",
//     instanceType: "t2.micro",
//     vpcSecurityGroupIds: [webappSecurityGroup.id], // Reference to the security group created above
//     rootBlockDevice: {
//         // Make sure these values match your requirements
//         volumeSize: 25, // Root Volume Size
//         volumeType: "gp2", // Root Volume Type
//         deleteOnTermination: true, // Make sure volumes are deleted on instance termination
//     },
//     subnetId: privateSubnets[0].id, // Reference to the VPC created above
//     associatePublicIpAddress: true, // Ensure that the instance gets a public IP
//     disableApiTermination: false, // Protect against accidental termination
// });

// // Export the ID and Public IP of the Instance
// export const instanceId = ec2.id;
// export const publicIp = ec2.publicIp;

// // Export the ID and ARN of the security group
// export const securityGroupId = webappSecurityGroup.id;
// export const securityGroupArn = webappSecurityGroup.arn;
// import * as pulumi from "@pulumi/pulumi";
// import * as aws from "@pulumi/aws";
// import * as netmask from "netmask";

// const config = new pulumi.Config();
// const networkIP = config.require("VPC_IP");
// const networkMask = config.require("VPC_CIDR_MASK");
// const subnetMask = config.require("SUBNET_MASK");
// const vpcname = config.require("vpcName");
// const igwname = config.require("igwName");

// const my_vpc = new aws.ec2.Vpc("my_vpc", {
//     cidrBlock: networkIP + "/" + networkMask,
//     instanceTenancy: "default",
//     tags: {
//         Name: vpcname,
//     },
// });

// // Creating Internet Gateway for VPC
// const app_igw = new aws.ec2.InternetGateway("app_igw", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: igwname,
//     },
// });

// const az = pulumi.output(aws.getAvailabilityZones());

// const publicSubnets: aws.ec2.Subnet[] = [];
// const privateSubnets: aws.ec2.Subnet[] = [];

// const publicRT = new aws.ec2.RouteTable("publicRT", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: "publicRT",
//     },
// });

// const privateRT = new aws.ec2.RouteTable("privateRT", {
//     vpcId: my_vpc.id,
//     tags: {
//         Name: "privateRT",
//     },
// });

// const availableAZ = az.apply(az => az.names.slice(0, 3));
// var block = new netmask.Netmask(networkIP + "/" + subnetMask);

// // Function to create a subnet asynchronously
// const createSubnet = (az: string, i: number) => {
//     const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
//         cidrBlock: block.toString(),
//         vpcId: my_vpc.id,
//         availabilityZone: az,
//         tags: {
//             Name: `public-subnet-${i}`,
//         },
//     });
//     block = block.next();
//     publicSubnets.push(publicSubnet);

//     new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${i}`, {
//         subnetId: publicSubnet.id,
//         routeTableId: publicRT.id,
//     });

//     const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
//         cidrBlock: block.toString(),
//         vpcId: my_vpc.id,
//         availabilityZone: az,
//         tags: {
//             Name: `private-subnet-${i}`,
//         },
//     });
//     block = block.next();
//     privateSubnets.push(privateSubnet);

//     new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${i}`, {
//         subnetId: privateSubnet.id,
//         routeTableId: privateRT.id,
//     });
    
    
// };

// // Create subnets asynchronously
// availableAZ.apply(azs => {
//     azs.forEach((az, i) => {
//         createSubnet(az, i);
//     });
// });

// // Create a security group for the web application
// const webappSecurityGroup = new aws.ec2.SecurityGroup("webappSecurityGroup", {
//     description: "Web application security group",
//     ingress: [
//         { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }, // SSH
//         { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }, // HTTP
//         { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] }, // HTTPS
//         { protocol: "tcp", fromPort: 3000, toPort: 3000, cidrBlocks: ["0.0.0.0/0"] }, // Your application port
//     ],
// });

// // Now you can access the subnet IDs outside the loop
// const publicSubnetIds = publicSubnets.map(subnet => subnet.id);

// // Create an EC2 instance with the given inputs
// const ec2 = new aws.ec2.Instance("web-server", {
//     ami: "ami-0e0d574018df89af4",
//     instanceType: "t2.micro",
//     vpcSecurityGroupIds: [webappSecurityGroup.id],
//     rootBlockDevice: {
//         volumeSize: 25,
//         volumeType: "gp2",
//         deleteOnTermination: true,
//     },
//     subnetId: publicSubnetIds[0],
//     associatePublicIpAddress: true,
//     disableApiTermination: false,
// });

// // Export the ID and Public IP of the Instance
// export const instanceId = ec2.id;
// export const publicIp = ec2.publicIp;
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as netmask from "netmask";

const config = new pulumi.Config();
const networkIP = config.require("VPC_IP");
const networkMask = config.require("VPC_CIDR_MASK");
const subnetMask = config.require("SUBNET_MASK");
const vpcname = config.require("vpcName");
const igwname = config.require("igwName");

const my_vpc = new aws.ec2.Vpc("my_vpc", {
    cidrBlock: networkIP + "/" + networkMask,
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
var block = new netmask.Netmask(networkIP + "/" + subnetMask);

// Function to create a subnet asynchronously
const createSubnet = (az: string, i: number) => {
    const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
        cidrBlock: block.toString(),
        vpcId: my_vpc.id,
        availabilityZone: az,
        tags: {
            Name: `public-subnet-${i}`,
        },
    });
    block = block.next();
    publicSubnets.push(publicSubnet);

    new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${i}`, {
        subnetId: publicSubnet.id,
        routeTableId: publicRT.id,
    });

    const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
        cidrBlock: block.toString(),
        vpcId: my_vpc.id,
        availabilityZone: az,
        tags: {
            Name: `private-subnet-${i}`,
        },
    });
    block = block.next();
    privateSubnets.push(privateSubnet);

    new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${i}`, {
        subnetId: privateSubnet.id,
        routeTableId: privateRT.id,
    });
};

// Create subnets asynchronously
availableAZ.apply(azs => {
    azs.forEach((az, i) => {
        createSubnet(az, i);
    });
});

// Create a security group for the web application
const webappSecurityGroup = new aws.ec2.SecurityGroup("webappSecurityGroup", {
    description: "Web application security group",
    ingress: [
        { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }, // SSH
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }, // HTTP
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] }, // HTTPS
        { protocol: "tcp", fromPort: 3000, toPort: 3000, cidrBlocks: ["0.0.0.0/0"] }, // Your application port
    ],
});

// Now you can access the subnet IDs outside the loop
const publicSubnetIds = publicSubnets.map(subnet => subnet.id);

// Create an EC2 instance with the given inputs
const ec2 = new aws.ec2.Instance("web-server", {
    ami: config.require("ami"),
    instanceType: "t2.micro",
    vpcSecurityGroupIds: [webappSecurityGroup.id],
    rootBlockDevice: {
        volumeSize: 25,
        volumeType: "gp2",
        deleteOnTermination: true,
    },
    subnetId: publicSubnetIds[0],
    associatePublicIpAddress: true,
    disableApiTermination: false,
    keyName:config.require("keyName")
});

// Create a default route in the public route table for the Internet Gateway
new aws.ec2.Route("publicRoute", {
    routeTableId: publicRT.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: app_igw.id,
});

// Export the ID and Public IP of the Instance
export const instanceId = ec2.id;
export const publicIp = ec2.publicIp;
