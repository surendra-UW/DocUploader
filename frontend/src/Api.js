import { AWS } from 'aws-sdk';
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { nanoid } from 'nanoid';


// AWS.config.region = 'us-east-2';

// AWS.config.credentials = new AWS.CognitoIdentityCredentials({
//     IdentityPoolId: ''});
 
const S3_FILE_UPLOAD_BUCKET_NAME='cdkappstack-filebucketcdfcd6de-xlrdgcslmadk';
const AWS_REGION='us-east-2';
console.log(process.env.AWS_REGION);
const client = new S3Client({region: AWS_REGION});

const TEXT_FILE_EXTENSION = ".txt";
const BUCKET_NAME = S3_FILE_UPLOAD_BUCKET_NAME;
async function uploadToS3(file) {
    const regex = new RegExp(/\.[^/.]+$/)
    const fileName = file.name.replace(regex, "");
    //Using nanoid to generate a unique file name so that it wont overide existing files
    const generatedFileName = fileName+nanoid(6)+TEXT_FILE_EXTENSION;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: generatedFileName,
        Body: file,
      });

    try {
        const response = await client.send(command);
        console.log(response);
      } catch (err) {
        console.error(err);
      }
}

function sendToApiGateway() {
    const apiGateway = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: ''
    });
    
    const apiGatewayPaylod = {
    
    };
    
    const response = apiGateway.postToConnection(apiGatewayPaylod, function(err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
    });
    return response;
}


export { uploadToS3, sendToApiGateway };