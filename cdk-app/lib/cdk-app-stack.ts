import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';

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

    fileUploadBucket.addCorsRule({
      allowedOrigins: ['*'], 
      allowedMethods: [s3.HttpMethods.PUT],
      allowedHeaders: ['*'],
    });
    //Output the bucket name created
    new cdk.CfnOutput(this, 'FileUploadBucketName', {
      value: fileUploadBucket.bucketName,
    })

    // S3 File Upload Presigned URL Generator Lambda 
    const presignedUrlGeneratorFunction = new lambda.Function(this, 'generateSignedUrlS3', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: new lambda.AssetCode('src/s3Uploader'),
      handler: 'uploaderFunction.handler',
      timeout: cdk.Duration.seconds(30),
    });

    // Add S3 permissions to Lambda
    fileUploadBucket.grantReadWrite(presignedUrlGeneratorFunction);
    
    // DynamoDB Table
    const itemsTable = new dynamodb.Table(this, 'FileTextTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // Lambda Function code in src directory
    const functionCode = new lambda.AssetCode('src/producer');
    const insertToDynamoDBFunction = new lambda.Function(this, 'InsertItem', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: functionCode,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: itemsTable.tableName
      },
    });

    // Add DynamoDB permissions to Lambda 
    itemsTable.grantWriteData(insertToDynamoDBFunction);

    //Gateway POST API
    const gatewayApi = new apigateway.RestApi(this, 'DocumentUploaderApi');

    const apiIntegrationS3 = new apigateway.AwsIntegration({
      proxy: true,
      service: 'lambda',
      path: `2015-03-31/functions/${presignedUrlGeneratorFunction.functionArn}/invocations`
    });

    const apiIntegrationDynamo = new apigateway.AwsIntegration({
      proxy: true,
      service: 'lambda',
      path: `2015-03-31/functions/${insertToDynamoDBFunction.functionArn}/invocations`
    });

    const s3UploadResource = gatewayApi.root.addResource('getS3UploadUrl');
    const metadataUploadResource = gatewayApi.root.addResource('uploadFileMetadata');
    const corsOptions = {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      allowMethods: ['POST'],
      allowCredentials: true,
    };

    s3UploadResource.addCorsPreflight(corsOptions); 
    metadataUploadResource.addCorsPreflight(corsOptions);
    // Create a Cognito user pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: {
        email: true
      },
    });

    const client = userPool.addClient('LocalAppClient', {
      generateSecret: false,  
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          implicitCodeGrant :true
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID],
        callbackUrls: [`http://localhost:3000/`],
        logoutUrls: [`http://localhost:3000/`],
      },
    })

    userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: 'doc-uploader-service'
      }
    });
    // Output the user pool id
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId
    });

    const authorizer = new apigateway.CfnAuthorizer(this, 'CognitoAuthorizer', {
      type: 'COGNITO_USER_POOLS',
      providerArns: [userPool.userPoolArn],
      name: 'CognitoAuthorizer',
      restApiId: gatewayApi.restApiId,
      identitySource: 'method.request.header.Authorization'
    });
    
    metadataUploadResource.addMethod('POST', apiIntegrationDynamo, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref  
      }
    });

    s3UploadResource.addMethod('POST', apiIntegrationS3, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref  
      }
    });
    presignedUrlGeneratorFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
    insertToDynamoDBFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
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

  }
}

// Run the CDK app
const app = new cdk.App();
new CdkAppStack(app, stackName);
app.synth();