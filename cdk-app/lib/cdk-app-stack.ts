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
    const functionCode = new lambda.AssetCode('src');
    const lambdaFunction = new lambda.Function(this, 'InsertItem', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: functionCode,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: itemsTable.tableName
      },
    });

    // Add DynamoDB permissions to Lambda 
    itemsTable.grantWriteData(lambdaFunction);

    //Gateway POST API
    const gatewayApi = new apigateway.RestApi(this, 'ExecuteFileEndpoint');
    const apiIntegration = new apigateway.AwsIntegration({
      proxy: true,
      service: 'lambda',
      path: `2024-04-05/functions/${lambdaFunction.functionArn}/invocations`
    });

    const root = gatewayApi.root.addResource('uploadFileApi');
    root.addMethod('POST', apiIntegration);

    //Lambda Function for DynamoDB streams 
    const dynamoDbStreamLambda = new lambda.Function(this, 'StreamLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: functionCode,
      handler: 'dynamoLambda.handler',
      timeout: cdk.Duration.seconds(90),
    });

    // Add DynamoDB Stream read permissions to Lambda
    itemsTable.grantStreamRead(dynamoDbStreamLambda);

    // Add EC2 permissions to DynamoDb Lambda
    dynamoDbStreamLambda.addToRolePolicy(new iam.PolicyStatement({
      sid: 'LambdaEC2RunPolicy',
      resources: ['*'],
      actions: ['ec2:RunInstances'],
    }));

    //process stream records 
    dynamoDbStreamLambda.addEventSource(new DynamoEventSource(itemsTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
    }));

    // Authorizer (Placeholder, needs configuration)
    // const authorizer = new apigateway.CfnAuthorizer(this, 'CognitoAuthorizer', {
    //   // Configure authorizer type and other properties
    // });

    // Define API Gateway authorizer association (if applicable)
    // root.addMethod('POST', apiIntegration, {
    //   authorizationType: apigateway.AuthorizationType.CUSTOM,
    //   authorizer: authorizer,
    // });

    // S3 Bucket

    // EC2 Instance (Placeholder)
    // const vpc = new ec2.Vpc(this, 'MyVpc');
    // const instance = new ec2.Instance(this, 'MyInstance', {
    //   vpc,
    //   // ... other instance properties
    // });

    // CDK Metadata (Example)
    // new cdk.CfnTag(this, 'GroupTag', {
    //   key: 'Label',
    //   value: 'Group',
    //   resourceArn: api.arn,
    // });

    // new cdk.CfnTag(this, 'Group2Tag', {
    //   key: 'Label',
    //   value: 'Group2',
    //   // Resource can be instance.instanceArn if using EC2 Instance
    // });
  }
}

// Run the CDK app
const app = new cdk.App();
new CdkAppStack(app, stackName);
app.synth();