import React from 'react';
import { useState } from 'react'


const FileInputPage = () =>
  {
    
  const [inputFile, setInputFile] = useState<File | null>(null)

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.currentTarget as HTMLInputElement).files
    if (files && files.length > 0)
    {
        setInputFile(files[0])
    }
  }

  return (
    <>
      <h1>File-Sharing Application.</h1>
      <div className="fileInput">
        <input type="file" onChange={handleOnChange}></input>
      </div>
      <h2>This is the name of inputFile: {inputFile ? inputFile.name: 'No file selected'}</h2>
    </>
  )
}

export default FileInputPage
