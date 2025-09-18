import React from 'react';
import { useState } from 'react'

interface FileInputProps
{
  onLogout: () => void
}
const FileInputPage: React.FC<FileInputProps> = ({onLogout }) =>
  {
  const [inputFile, setInputFile] = useState<File | null>(null)

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.currentTarget as HTMLInputElement).files
    if (files && files.length > 0)
    {
        setInputFile(files[0])
    }
  }

  onLogout()
  return (
    <>
      <h1>File-Sharing Application.</h1>
      <div className="card">
        <input type="file" onChange={handleOnChange}></input>
      </div>
      <h2>This is the name of inputFile: {inputFile ? inputFile.name: 'No file selected'}</h2>
    </>
  )
}

export default FileInputPage;
