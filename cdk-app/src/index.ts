// Import required AWS SDK clients and commands for DynamoDB
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamo-db");

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({ region: "us-east-1" }); 

// Export the handler
exports.handler = async (event:any) => {

  // Get table name from environment variable
  const tableName = process.env.TABLE_NAME;

  // Get item data from API Gateway proxy payload
  const item = JSON.parse(event.body);

  // Construct DynamoDB put item request
  const putItemCommand = new PutItemCommand({
    TableName: tableName,
    Item: item
  });

  // Call DynamoDB put item API 
  const data = await dynamoClient.send(putItemCommand);

  // Return response
  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };

};