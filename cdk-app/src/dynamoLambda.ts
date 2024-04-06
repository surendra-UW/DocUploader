

const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();

exports.handler = async (event:any) => {
    event.Records.forEach((record:any) => {
        console.log('Event', record);
    });

    const params = {
        ImageId: 'ami-1234567890abcdef0', 
        MinCount: 1,
        MaxCount: 1,
        InstanceType: 't2.micro'
    };
    try{

        const data = await ec2.RunInstances(params).promise();
        // Log instance ID
        console.log(`Instance ID: ${data.Instances[0].InstanceId}`);
    } catch (err) {
    console.log('Error in launching instance', err);
    }
    return;
};