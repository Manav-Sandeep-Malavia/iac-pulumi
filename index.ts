import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as netmask from "netmask";
import * as cloudwatch from "@pulumi/aws/cloudwatch";
import * as gcp from "@pulumi/gcp";
import { Topic } from "@pulumi/aws/sns";
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');



const config = new pulumi.Config();
const networkIP = config.require("VPC_IP");
const networkMask = config.require("VPC_CIDR_MASK");
const subnetMask = config.require("SUBNET_MASK");
const vpcname = config.require("vpcName");
const igwname = config.require("igwName");
const keyName = config.require("keyName");

const topic = new aws.sns.Topic("webapp-sns");

const logGroup = new aws.cloudwatch.LogGroup("my-log-group", {
    name: "csye6225_webapp",
    
});

const logStream = new aws.cloudwatch.LogStream("my-log-stream", {
    name: "webapp",
    logGroupName: logGroup.name,
});

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
  

  const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadbalancerSecurityGroup", {
    vpcId: my_vpc.id,
    description: "Load balancer security group",
    ingress: [
      
      // HTTPS access
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    });

  const webappSecurityGroup = new aws.ec2.SecurityGroup("webappSecurityGroup", {
    vpcId: my_vpc.id,
    description: "Web application security group",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ["0.0.0.0/0"],
      }, 

      {
        protocol: "tcp",
        fromPort: 3000,
        toPort: 3000,
        securityGroups: [loadBalancerSecurityGroup.id], 
      }, 
      
    ],
    egress: [
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ["0.0.0.0/0"],
    }
  ],

  });

  let myloadbalancerEgressRule = new aws.ec2.SecurityGroupRule("myloadbalancerEgressRule", {
    type: "egress",
    securityGroupId: loadBalancerSecurityGroup.id,
    protocol: "tcp",
    fromPort: 3000,
    toPort: 3000,
    sourceSecurityGroupId: webappSecurityGroup.id
  
  })
  
  const publicSubnetIds = publicSubnets.map((subnet) => subnet.id);
  const privateSubnetIds = privateSubnets.map((subnet) => subnet.id);

  const mariadbSG = new aws.ec2.SecurityGroup("mariadb-sg", {
    vpcId: my_vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3306,
        toPort: 3306,
        securityGroups: [webappSecurityGroup.id]
      },
    ],
  });

  let myEgressRule = new aws.ec2.SecurityGroupRule("myEgressRule", {
    type: "egress",
    securityGroupId: webappSecurityGroup.id,
    protocol: "tcp",
    fromPort: 3306,
    toPort: 3306,
    sourceSecurityGroupId: mariadbSG.id
  
  })


const mariadbParameterGroup = new aws.rds.ParameterGroup(
  "mariadb-parameter-group",
  {
    family: "mariadb10.11",
    description: "Parameter group for MariaDB",
    parameters: [
      {
        name: "max_connections",
        value: "100", 
      },
    ],
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
  echo 'TOPICARN=${topic.arn}' >> /etc/environment
  echo 'AWS_REGION=${config.require('region')}' >> /etc/environment
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
  new aws.iam.RolePolicyAttachment("generalrolepolicy", {
    role: role.id,
    policyArn: aws.iam.ManagedPolicies.AmazonSNSFullAccess,
  });


  const roleInstanceProfile = new aws.iam.InstanceProfile("roleInstanceProfile", {
    role: role.name,
  });


  const hostedZoneName = config.require('hostedZone');
  const hostedZone = aws.route53.getZone({ name: hostedZoneName });

  const encodedUserData = userDataScript.apply(ud => Buffer.from(ud).toString('base64'))

  function getFormattedTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
}
  const launchTemplate = new aws.ec2.LaunchTemplate("launchTemplate", {
    name:"webapp-launchtemplate",
    imageId: ami_id.id,
    instanceType: "t2.micro",
    keyName: keyName,
    iamInstanceProfile: {
        name: roleInstanceProfile.name,
    },
    userData: encodedUserData,
    disableApiTermination: false,
    networkInterfaces: [
      {
        associatePublicIpAddress: "true",
        securityGroups: [webappSecurityGroup.id]
      }
    ],
    tagSpecifications: [
      {
          resourceType: "instance",
          tags: {
            "Name": `Instance-${getFormattedTimestamp()}`, 
            "LaunchedAt": getFormattedTimestamp(),   
              
          },
      },
      {
          resourceType: "volume",
          tags: {
            "volumeName": `Volume-${getFormattedTimestamp()}`, 
            "LaunchedAt": getFormattedTimestamp(),   
              
          },
      },
      {
          resourceType: "network-interface",
          tags: {
              "networkInterfaceName": `NetworkInterface-${getFormattedTimestamp()}`,
              "InitializedAt": getFormattedTimestamp(),
              
          },
      },
      
  ],
  });

  const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
      name:"webapp-autoscaling",
      desiredCapacity: 1,
      maxSize: 3,
      minSize: 1,
      defaultCooldown:60,
      launchTemplate: {
          id: launchTemplate.id,
          version: "$Latest"
      },
      vpcZoneIdentifiers: publicSubnets.map(subnet => subnet.id),
  });

  const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    scalingAdjustment: 1, 
  });


  const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
      autoscalingGroupName: autoScalingGroup.name,
      adjustmentType: "ChangeInCapacity",
      cooldown: 60,
      scalingAdjustment: -1, 
  });

  const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("scaleUpAlarm", {
    alarmDescription: "Alarm when CPU exceeds 5%",
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 2,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 5,
    alarmActions: [scaleUpPolicy.arn],
    dimensions: {
        AutoScalingGroupName: autoScalingGroup.name,
    },
  });

  const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("scaleDownAlarm", {
      alarmDescription: "Alarm when CPU falls below 3%",
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 2,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      statistic: "Average",
      threshold: 3,
      alarmActions: [scaleDownPolicy.arn],
      dimensions: {
          AutoScalingGroupName: autoScalingGroup.name,
      },
  });


  const appLoadBalancer = new aws.lb.LoadBalancer("appLoadBalancer", {
      internal: false,
      loadBalancerType: "application",
      securityGroups: [loadBalancerSecurityGroup.id],
      subnets: publicSubnets.map(subnet => subnet.id),
      enableDeletionProtection: false,
  });


  const appTargetGroup = new aws.lb.TargetGroup("appTargetGroup", {
      port: 3000,
      protocol: "HTTP",
      vpcId: my_vpc.id,
      targetType: "instance",
      deregistrationDelay:60,
      healthCheck: {
        enabled: true,
        path: "/healthz", 
        protocol: "HTTP", 
        interval: 30, 
        timeout: 5, 
        healthyThreshold: 2, 
        unhealthyThreshold: 2, 
    },

  });


  const listener = new aws.lb.Listener("listener", {
      loadBalancerArn: appLoadBalancer.arn,
      port: 443,
      protocol: "HTTPS",
      certificateArn: config.require('certificateArn'),
      defaultActions: [{
          type: "forward",
          targetGroupArn: appTargetGroup.arn,
      }],
  });
  
  const record = new aws.route53.Record('wwwRecord', {
    name: config.require('domainName'),
    type: 'A',
    zoneId: hostedZone.then(zone => zone.zoneId),
    aliases: [{
      name: appLoadBalancer.dnsName,
      zoneId: appLoadBalancer.zoneId,
      evaluateTargetHealth: true,
    }],    
  });

  const attachment = new aws.autoscaling.Attachment("asgAttachment", {
      autoscalingGroupName: autoScalingGroup.name,
      lbTargetGroupArn: appTargetGroup.arn,
  }, 
  { dependsOn: [appLoadBalancer, appTargetGroup] });


  const tableName = config.require('tableName'); 

  const table = new aws.dynamodb.Table(tableName, {
      name: tableName,
      attributes: [
          {
              name: "id",
              type: "S",  
          },
      ],
      hashKey: "id",
      billingMode: "PAY_PER_REQUEST",
      tags: {
          Name: "EmailsDynamoDBTable",
      },
  });

  // google setup
  const gcsbucket = config.require('bucketname'); 

  const bucketName = new gcp.storage.Bucket("webapp_bucket", {
      name: gcsbucket,
      location: "us-west1", 
      forceDestroy: true,
  });
  
  

  const serviceAccountId = config.require('serviceAccountId'); 

  
  const serviceAccount = new gcp.serviceaccount.Account("serviceAccount", {
      accountId: serviceAccountId, 
      displayName: "My Service Account",
      project: config.require('project'),
  });

  
  const serviceAccountKey = new gcp.serviceaccount.Key("myServiceAccountKey", {
      serviceAccountId: serviceAccount.name,
  });

  const customRole = new gcp.projects.IAMCustomRole("myCustomRole", {
    roleId: "StorageObjectCreator",
    title: "Storage Object Creator",
    permissions: ["storage.objects.create"],
    project: config.require('project'),
  });


  const roleBinding = new gcp.projects.IAMMember("myRoleBinding", {
    role: customRole.name,
    member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
    project: config.require('project'),
  });

  const creds = pulumi.all([serviceAccountKey.privateKey]).apply(([privateKey]) => {
    return Buffer.from(privateKey, 'base64').toString();
});


// sns and lambda
  


  const lambdaRole = new aws.iam.Role("lambdaRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }],
    }),
  });

  new aws.iam.RolePolicyAttachment("basicexecutionrolepolicy", {
    role: lambdaRole.id,
    policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
  });

  new aws.iam.RolePolicyAttachment("s3rolepolicy", {
    role: lambdaRole.id,
    policyArn: aws.iam.ManagedPolicies.AmazonS3ReadOnlyAccess,
  });

  new aws.iam.RolePolicyAttachment("dynamodbrolepolicy", {
    role: lambdaRole.id,
    policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
  });


  
  const myLambda = new aws.lambda.Function("webapp-sns-lambda", {
    name: 'webapp-sns-lambda',
    runtime: aws.lambda.Runtime.NodeJS16dX, 
    s3Bucket: config.require('s3bucket'),
    s3Key: config.require('s3key'),
    handler: "index.handler",
    role: lambdaRole.arn,
    environment: {
      variables: {
        GCP_SERVICE_ACCOUNT_KEY: creds, 
        MAILGUN_API_KEY: config.require('mailgun_api'),
        BUCKET_NAME: bucketName.name, 
        DYNAMODB_TABLE_NAME: table.name,
      }
    },
    timeout: 600 
  });


  
  const mySubscription = new aws.sns.TopicSubscription("mySubscription", {
    topic: topic.arn,
    protocol: "lambda",
    endpoint: myLambda.arn,
  });


  const lambdaPermission = new aws.lambda.Permission("lambdaPermission", {
    action: "lambda:InvokeFunction",
    function: myLambda.name,
    principal: "sns.amazonaws.com",
    sourceArn: topic.arn,
  });

  




});
