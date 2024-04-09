import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

const stackName = 'my-stack';

export class CdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket
    const fileUploadBucket = new s3.Bucket(this, 'FileBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    //Output the bucket name created
    new cdk.CfnOutput(this, 'FileUploadBucketName', {
      value: fileUploadBucket.bucketName,
    })

    // DynamoDB Table
    const itemsTable = new dynamodb.Table(this, 'FileTextTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // Lambda Function code in src directory
    const functionCode = new lambda.AssetCode('src/producer');
    const InsertToDynamoDBFunction = new lambda.Function(this, 'InsertItem', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: functionCode,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: itemsTable.tableName
      },
    });

    // Add DynamoDB permissions to Lambda 
    itemsTable.grantWriteData(InsertToDynamoDBFunction);

    //Gateway POST API
    const gatewayApi = new apigateway.RestApi(this, 'ExecuteFileEndpoint');
    const apiIntegration = new apigateway.AwsIntegration({
      proxy: true,
      service: 'lambda',
      path: `2015-03-31/functions/${InsertToDynamoDBFunction.functionArn}/invocations`
    });

    const root = gatewayApi.root.addResource('uploadFileApi');
    root.addMethod('POST', apiIntegration);

    InsertToDynamoDBFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
    //Lambda Function for DynamoDB streams 
    const dynamoDbStreamConsumerFunction = new lambda.Function(this, 'StreamLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: new lambda.AssetCode('src/consumer'),
      handler: 'dynamoLambda.handler',
      timeout: cdk.Duration.seconds(90),
    });

    // Add DynamoDB Stream read permissions to Lambda
    itemsTable.grantStreamRead(dynamoDbStreamConsumerFunction);

    // Add EC2 permissions to DynamoDb Lambda
    dynamoDbStreamConsumerFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'LambdaEC2RunPolicy',
      resources: ['*'],
      actions: ['ec2:RunInstances'],
    }));

    //process stream records 
    dynamoDbStreamConsumerFunction.addEventSource(new DynamoEventSource(itemsTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
    }));

    const role = new iam.Role(this, 'Ec2InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')  
    });
    
    // Add S3 permissions(Only to the fileupload bucket) to EC2 Instance
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'], 
      resources: [`arn:aws:s3:::${fileUploadBucket.bucketName}`, `arn:aws:s3:::${fileUploadBucket.bucketName}/*`]
    }));
    
    // Add DynamoDB permissions (Only to the items Table) to EC2 Instance
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
      resources: [itemsTable.tableArn] 
    }));

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    
    // Create instance profile and associate role
    const instanceProfile = new iam.CfnInstanceProfile(this, 'Profile', {
      roles: [role.roleName],
      instanceProfileName: 'Ec2InstanceProfile'
    });

    //Attach PassRole permission to Comsumer Lambda 
    dynamoDbStreamConsumerFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'LambdaIamPassRolePolicy',
      resources: [role.roleArn],
      actions: ['iam:PassRole'],
      effect: iam.Effect.ALLOW,
    }));

    dynamoDbStreamConsumerFunction.addEnvironment('EC2_INSTANCE_PROFILE_NAME', instanceProfile.instanceProfileName as string);
    dynamoDbStreamConsumerFunction.addEnvironment('DYNAMODB_TABLE_NAME', itemsTable.tableName);
    // Authorizer (Placeholder, needs configuration)
    // const authorizer = new apigateway.CfnAuthorizer(this, 'CognitoAuthorizer', {
    //   // Configure authorizer type and other properties
    // });

    // Define API Gateway authorizer association (if applicable)
    // root.addMethod('POST', apiIntegration, {
    //   authorizationType: apigateway.AuthorizationType.CUSTOM,
    //   authorizer: authorizer,
    // });

  }
}

// Run the CDK app
const app = new cdk.App();
new CdkAppStack(app, stackName);
app.synth();