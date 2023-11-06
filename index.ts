import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as netmask from "netmask";

const config = new pulumi.Config();
const networkIP = config.require("VPC_IP");
const networkMask = config.require("VPC_CIDR_MASK");
const subnetMask = config.require("SUBNET_MASK");
const vpcname = config.require("vpcName");
const igwname = config.require("igwName");
const keyName = config.require("keyName");

const my_vpc = new aws.ec2.Vpc("my_vpc", {
  cidrBlock: networkIP + "/" + networkMask,
  instanceTenancy: "default",
  tags: {
    Name: vpcname,
  },
});

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


new aws.ec2.Route("publicRoute", {
  routeTableId: publicRT.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: app_igw.id,
});

const availableAZ = az.apply((az) => az.names.slice(0, 3));
var block = new netmask.Netmask(networkIP + "/" + subnetMask);


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


availableAZ.apply((azs) => {
  azs.forEach((az, i) => {
    createSubnet(az, i);
  });

  
  const webappSecurityGroup = new aws.ec2.SecurityGroup("webappSecurityGroup", {
    vpcId: my_vpc.id,
    description: "Web application security group",
    ingress: [
      { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }, // SSH
      { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }, // HTTP
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      }, // HTTPS
      {
        protocol: "tcp",
        fromPort: 3000,
        toPort: 3000,
        cidrBlocks: ["0.0.0.0/0"],
      }, // Your application port
      
    ],
    egress: [{
      fromPort: 3306,
      toPort: 3306,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ["0.0.0.0/0"],
    }
  ],

  });

  
  const publicSubnetIds = publicSubnets.map((subnet) => subnet.id);
  const privateSubnetIds = privateSubnets.map((subnet) => subnet.id);

  const mariadbSG = new aws.ec2.SecurityGroup("mariadb-sg", {
    vpcId: my_vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3306,
        toPort: 3306,
        cidrBlocks: ["0.0.0.0/0"],
        securityGroups: [webappSecurityGroup.id]
      },
    ],
  });

  const mariadbParameterGroup = new aws.rds.ParameterGroup(
    "mariadb-parameter-group",
    {
      family: "mariadb10.11",
      description: "Parameter group for MariaDB",
    }
  );

  const mariadbSubnetGroup = new aws.rds.SubnetGroup("mariadb-subnet-group", {
    subnetIds: [privateSubnets[0].id, privateSubnets[1].id],
  });


  const mariadbInstance = new aws.rds.Instance("mariadb-instance", {
    allocatedStorage: 20,
    engine: "mariadb",
    engineVersion: "10.11.5", 
    instanceClass: "db.t3.micro",
    multiAz: false,
    parameterGroupName: mariadbParameterGroup.id,
    username: config.require('username'), 
    password: config.require('password'), 
    dbName: config.require('dbName'), 
    dbSubnetGroupName: mariadbSubnetGroup.name,
    publiclyAccessible: false,
    skipFinalSnapshot: true, 
    vpcSecurityGroupIds: [mariadbSG.id],
  });

  const userDataScript = pulumi.interpolate`#!/bin/bash
  echo 'DB_USER=${mariadbInstance.username}' >> /etc/environment
  echo 'DB_PASSWORD=${mariadbInstance.password}' >> /etc/environment
  echo 'DB_NAME=${mariadbInstance.dbName}' >> /etc/environment
  echo 'DB_HOST=${mariadbInstance.address}' >> /etc/environment
  echo 'DB_PORT=${config.require('port')}' >> /etc/environment
  echo 'DIALECT=${config.require('dialect')}' >> /etc/environment
  echo 'DEFAULTUSERPATH=${config.require('defaultuserpath')}' >> /etc/environment
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/webapp/cloudwatch-config.json \
    -s
`;
const ami_id = pulumi.output(aws.ec2.getAmi({
  owners: [ config.require('aws_account') ],
  mostRecent: true,
  filters: [
      { name: "name", values: [ "csye6225_debianami-*" ] },
  ],
}));

const role = new aws.iam.Role("role", {
  assumeRolePolicy: JSON.stringify({
      "Version": "2012-10-17",
      "Statement": [{
          "Effect": "Allow",
          "Principal": {
              "Service": "ec2.amazonaws.com"
          },
          "Action": "sts:AssumeRole",
      }],
  }),
});

new aws.iam.RolePolicyAttachment("rolePolicyAttachment", {
  role: role.id,
  policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
});


const roleInstanceProfile = new aws.iam.InstanceProfile("roleInstanceProfile", {
  role: role.name,
});


  const ec2 = new aws.ec2.Instance("web-server", {
    ami: ami_id.id,
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
    keyName: keyName,
    iamInstanceProfile: roleInstanceProfile.name,
    userData: userDataScript, 
  });


  const hostedZoneName = config.require('hostedZone');
  const hostedZone = aws.route53.getZone({ name: hostedZoneName });

  
  const record = new aws.route53.Record("record", {
    name: config.require('domainName'),
    type: "A",
    ttl: 300,
    zoneId: hostedZone.then(zone => zone.zoneId),
    records: [ec2.publicIp],
  });


});
