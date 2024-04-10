# Document File Uploader 

### Setup Instructions
Let's setup cloud infra: <br>
git clone <repo-url> <br>

#### Configure AWS cli
aws configure <br>
#### Deploy the infra
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
npm start <br>

Cognito User Pool is setup in the application. First go the Cognito User UI and login/signup
You will be redirected to the App UI automatically 
A id token is generated and captured in the app.

![Demo](./ss/ss1.png)
UI is built using React and tailwind css and some components are inspired from flowbite.
File format is restricted to .txt and other formats will throw and error on UI.
![Demo](./ss/ss2.png)
On form submission the file is uploaded to S3 directly from browser using a serverless API Gateway integration through mabda using a presigned URL. Both the S3 bucket and API Gateway are enabled cors.
File can be changed with 2 configuration:
1. Same name as the input file provided by User - This config will guarantee idempodent nature i.e, user can upload as many times as he can and every time the file will be replaced without creating additional copies.
2. A unique file name is generated using "nanoid" function. This will result in new file every time user uploads the file. 
It can be configured using REACT_APP_GENERATE_UNIQUE_FILENAME env variable. If true follow 2nd case. which is default.
![Demo](./ss/ss3.png)
Now, the file metadata is uploaded to Dynamo DB through api Gateway and Lambda (InsertitemLambda)
![Demo](./ss/ss4.png)
Dynamo DB streams are configured to be processed by lambda only if it's INSERT event which will protect trigger the script multiple times when we output file path.
![Demo](./ss/ss5.png)
![Demo](./ss/ss6.png)
Ec2 Metadata which is launcehed by streamLambda logs into cloud watch logs. We can find the EC2 instance id from the logs.
![Demo](./ss/ss7.png)
EC2 is terminated as soon as the script is executed. The logs are saved into Same S3 bucket with file append with _logs and output are saved as _output suffix. 
![Demo](./ss/ss8.png)
As, we can see the output is input appended with input text.
![Demo](./ss/ss9.png)

### App hosting 
The frontend app is doesn't need a server and can easily be hosted in S3 or AWS amplify cloudFront hosting.
To host the UI install aws amplify cli <br>

npm install -g @aws-amplify/cli <br>
amplify init <br>
amplify add hosting <br>
amplify push <br>