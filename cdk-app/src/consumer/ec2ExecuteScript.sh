#!/bin/bash

# This script is used to execute the script on the EC2 instance
key=$1
table_name=$2

echo "Getting the record data from dynamoDb"
key_json="{\"id\":{\"S\":\"$key\"}}"
# Call DynamoDB getItem to fetch item with matching key
response=$(aws dynamodb get-item \
  --table-name $table_name \
  --key "$key_json" \
  --output json)

if [ $? -ne 0 ]; then
  echo "Error getting the response from dynamodb:"
  echo "Terminating the vm instance"
  shutdown -h now
  exit 1 
fi

# Parse response to get file name 
filePath=$(echo $response | jq -r '.Item.input_file_path.S') 
inputText=$(echo $response | jq -r '.Item.input_text.S')
fileNameWithoutExtention=$(echo $filePath | sed 's/\.txt$//')

terminateEc2() {
    echo "Terminating the vm instance"
    echo "Upload logs to S3"
    log_file_path=$(echo $fileNameWithoutExtention"_logs.txt")
    aws s3 cp /var/log/cloud-init-output.log s3://$log_file_path
    shutdown -h now
}

echo "Downloading the S3 file from dynamoDb" "$filePath"
# Download file from S3 with fetched filename
s3DownloadResponse=$(aws s3 cp s3://$filePath ./Output.txt)

if [ $? -ne 0 ]; then
  echo "Error downloading file from S3 for the file $filePath with response $s3DownloadResponse"
  terminateEc2
  exit 1 
fi

echo " : $inputText" >> ./Output.txt
output_file_path=$(echo $fileNameWithoutExtention"_output.txt")

echo "Uploading the modified to S3 " "$output_file_path"

# Upload file back to S3 
s3UploadResponse=$(aws s3 cp ./Output.txt s3://$output_file_path)

if [ $? -ne 0 ]; then
  echo "Error uploading the modified file to S3 for the file $filePath with response $s3UploadResponse"
  terminateEc2
  exit 1 
fi

echo "Updating the output file path in DynamoDB" "$key"
updateExpressionValues="{\":s3path\":{\"S\":\"$output_file_path\"}}"
# Update item in DynamoDB with new S3 path
dynamodbUpdateResponse=$(aws dynamodb update-item \
  --table-name $table_name \
  --key "$key_json" \
  --update-expression "SET output_file_path = :s3path" \
  --expression-attribute-values "$updateExpressionValues" )

if [ $? -ne 0 ]; then
  echo "Error updating the ouput filepath in DynamoDB for the file $filePath with response $dynamodbUpdateResponse"
  terminateEc2
  exit 1 
fi

terminateEc2