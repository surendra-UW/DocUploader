# Document File Uploader 

### Setup Instructions
Let's setup cloud infra: <br>
git clone <repo-url> <br>
cd cdk-app<br>
npm install <br>
cdk deploy <br>

You will find the outputs <br>
CdkAppStack.FileUploadBucketName: (S3 bucket name)<br>
CdkAppStack.DocumentUploaderApiEndpoint6A2152AF (api gateway root endpoint)<br>
CdkAppStack.UserPoolId: (cognito user pool id)<br>

replace the bucket name and gateway endpoints in .env file <br>

#### Setup UI
cd frontend<br>
npm install<br>
