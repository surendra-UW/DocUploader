import { nanoid } from 'nanoid';
import axios from 'axios';


let generatedFileName='';

const TEXT_FILE_EXTENSION = ".txt";
const BUCKET_NAME = process.env.REACT_APP_S3_FILE_UPLOAD_BUCKET_NAME;
const API_GATEWAY_BASE_URL = process.env.REACT_APP_API_GATEWAY_BASE_URL;

async function uploadToS3(token, file) {
    const regex = new RegExp(/\.[^/.]+$/)
    const fileName = file.name.replace(regex, "");
    console.log(token);  
    //Using nanoid to generate a unique file name so that it wont overide existing files
    generatedFileName = process.env.REACT_APP_GENERATE_UNIQUE_FILENAME === 'false'?
        fileName+TEXT_FILE_EXTENSION: fileName+nanoid(6)+TEXT_FILE_EXTENSION;
    console.log(generatedFileName);
    const body = {
        bucketName: BUCKET_NAME,
        fileName: generatedFileName,
        fileType: 'text/plain',
      };
      
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
    };

    const presignedURL = await axios.post(API_GATEWAY_BASE_URL+'getS3UploadUrl', body, {headers: headers})
                                    .then(response => {
                                        console.log(response);
                                        if (response.status != 200) {
                                            throw new Error('Failed to get presigned URL');
                                        }  
                                        return response.data.uploadURL;
                                        // return axios.put(url, file, {headers: {'Content-Type': 'text/plain'}});
                                    })
                                    .catch((error) => {console.log(error);});
    
    if (!presignedURL) {
        console.error('Failed to upload to S3');
        alert('Failed to upload to S3');
        return generatedFileName;
    }

    await axios.put(presignedURL, file, {headers: {'Content-Type': 'text/plain'}})
    .then(response => {
        if (response.status != 200) {
            throw new Error('Failed to upload to S3');
        } else{
            alert('File uploaded successfully');
        }
    });
    return generatedFileName;
}

async function uploadMetadata(token, fileName, textInput) {
    console.log('updating metadata');
    const endPointUrl = API_GATEWAY_BASE_URL +'uploadFileMetadata';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
    };
    const apiGatewayPaylod = {
        "id": nanoid(),
        "input_file_path": BUCKET_NAME+'/'+fileName,
        "input_text": textInput
    };
    
    console.log(apiGatewayPaylod);

    const response = await axios.post(endPointUrl, apiGatewayPaylod, { headers: headers })
                                .then((response) => {
                                    console.log(response);
                                    if (response.status === 200) {
                                        alert('Metadata updated successfully');
                                    } else{
                                        console.log('Failed to update metadata');
                                    }
                                })
                                .catch((error) => {
                                    console.log(error);
                                    return error;
                                });
    return response;
}

export { uploadToS3, uploadMetadata };