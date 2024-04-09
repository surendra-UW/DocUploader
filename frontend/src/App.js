import './App.css';
import { useRef, useState } from 'react';
import './Api.js';
import { uploadToS3 } from './Api.js';

function App() {
  const TEXT_FILE_TYPE = 'text/plain';
  const textInput = useRef();
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== TEXT_FILE_TYPE) {
        alert('Invalid file type. Please upload text file');
      } else {
        console.log(file);
        setSelectedFile(file);
      }
    }
  };

  const handleSubmit = async (event) => {
    // validate the form values inputs 
    event.preventDefault();
    console.log(textInput);
    if (!textInput || !textInput.current.value){
      alert('Input text is required');
      return;
    }
    if (!selectedFile) {
      alert('Input File is required');
      return;
    }

    uploadToS3(selectedFile);
  };

  return (
      <form className='p-4'>
        <label className='font-serif' htmlFor="text-input">Text input: </label>
        <input 
          type="username" 
          placeholder="Enter Text" 
          ref={textInput} 
          id="text-input"
          className=' border-slate-300 bg-black text-white border rounded-sm px-1'
        />
        <br />
        <label className='font-serif' htmlFor="file-input">File input: </label>
        <input
          type="file" 
          onChange={handleFileChange} 
          id="file-input"
          className='my-5 bg-black text-sm text-white'
        />
        <br />
      <button className='border border-slate-300 px-1 text-sm rounded-sm' type="submit" onClick={handleSubmit}>
          Submit
      </button>
      </form>
  );
}

export default App;
