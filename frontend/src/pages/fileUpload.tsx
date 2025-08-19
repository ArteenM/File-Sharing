import React, { useState, useRef, useCallback } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Download, Trash2, Eye } from 'lucide-react';

// TypeScript interfaces for type safety

// Props interface for the FileUploadPage component
interface FileUploadPageProps {
  user: {
    id: string;
    username: string;
    accessToken: string;
    refreshToken: string;
  };
  onLogout: () => void;
}

// Represents a single uploaded file with metadata
interface UploadedFile {
  id: string;                    // Unique identifier for the file
  file: File;                   // The actual File object from the browser
  name: string;                 // Original filename
  size: number;                 // File size in bytes
  type: string;                 // MIME type (e.g., 'image/png', 'application/pdf')
  uploadProgress: number;       // Upload progress percentage (0-100)
  status: 'pending' | 'uploading' | 'completed' | 'error'; // Current upload status
  uploadedUrl?: string;         // URL of the uploaded file (if completed)
  errorMessage?: string;        // Error message if upload failed
}

// Props for individual file components
interface FileItemProps {
  file: UploadedFile;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

// Main File Upload Component
const FileUploadPage: React.FC<FileUploadPageProps> = ({ user, onLogout }) => {
  
  // ==================== STATE MANAGEMENT ====================
  
  // Array of all uploaded/uploading files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  
  // Controls drag and drop visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  
  // General loading state for the entire component
  const [isLoading, setIsLoading] = useState(false);
  
  // Error messages that apply to the whole component
  const [error, setError] = useState<string | null>(null);
  
  // Success message when operations complete
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Reference to the hidden file input element
  // useRef gives us direct access to DOM elements
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== UTILITY FUNCTIONS ====================
  
  // Convert file size from bytes to human-readable format
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Generate unique ID for each file
  const generateFileId = (): string => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };
  
  // Check if file type is allowed
  const isFileTypeAllowed = (file: File): boolean => {
    // Define allowed file types - you can modify this list
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents  
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Archives
      'application/zip', 'application/x-rar-compressed',
      // Audio/Video
      'audio/mpeg', 'video/mp4', 'video/quicktime'
    ];
    
    return allowedTypes.includes(file.type);
  };
  
  // Check if file size is within limits
  const isFileSizeAllowed = (file: File): boolean => {
    const maxSize = 10 * 1024 * 1024; // 10MB limit - adjust as needed
    return file.size <= maxSize;
  };

  // ==================== FILE HANDLING FUNCTIONS ====================
  
  // Process selected files and add them to the upload queue
  const handleFiles = useCallback((selectedFiles: FileList | File[]) => {
    // Clear any previous errors
    setError(null);
    
    // Convert FileList to Array for easier manipulation
    const fileArray = Array.from(selectedFiles);
    
    // Filter and validate files
    const validFiles: UploadedFile[] = [];
    const errors: string[] = [];
    
    fileArray.forEach(file => {
      // Check file type
      if (!isFileTypeAllowed(file)) {
        errors.push(`${file.name}: File type not allowed`);
        return;
      }
      
      // Check file size
      if (!isFileSizeAllowed(file)) {
        errors.push(`${file.name}: File size exceeds 10MB limit`);
        return;
      }
      
      // Check for duplicates (same name and size)
      const isDuplicate = files.some(existingFile => 
        existingFile.name === file.name && existingFile.size === file.size
      );
      
      if (isDuplicate) {
        errors.push(`${file.name}: File already added`);
        return;
      }
      
      // Create UploadedFile object
      validFiles.push({
        id: generateFileId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadProgress: 0,
        status: 'pending'
      });
    });
    
    // Show errors if any
    if (errors.length > 0) {
      setError(errors.join(', '));
    }
    
    // Add valid files to the state
    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
    
  }, [files]); // Dependency array - function will be recreated if 'files' changes

  // ==================== EVENT HANDLERS ====================
  
  // Handle file input change (when user selects files through the input)
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFiles(selectedFiles);
    }
    
    // Reset the input value so the same file can be selected again if removed
    e.target.value = '';
  };
  
  // Handle click on upload area (opens file dialog)
  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };
  
  // Drag and Drop Event Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Prevent default behavior (open file in browser)
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    // Get files from the drop event
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  };

  // ==================== UPLOAD FUNCTIONS ====================
  
  // Upload a single file to the server
  const uploadSingleFile = async (fileData: UploadedFile): Promise<void> => {
    // Update file status to uploading
    setFiles(prev => 
      prev.map(f => f.id === fileData.id ? { ...f, status: 'uploading' } : f)
    );
    
    try {
      // Create FormData object for file upload
      const formData = new FormData();
      formData.append('file', fileData.file);
      formData.append('originalName', fileData.name);
      
      // Get the auth token (in a real app, you'd get this from storage)
      // const token = localStorage.getItem('accessToken');
      
      const response = await fetch('http://localhost:5000/api/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.accessToken}` // Use the actual auth token from props
        },
        body: formData,
        
        // Track upload progress (this is a simplified version)
        // In a real app, you might use XMLHttpRequest for better progress tracking
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Update file status to completed
      setFiles(prev => 
        prev.map(f => 
          f.id === fileData.id 
            ? { 
                ...f, 
                status: 'completed', 
                uploadProgress: 100,
                uploadedUrl: result.fileUrl // URL where the file can be accessed
              } 
            : f
        )
      );
      
    } catch (error) {
      console.error('Upload error:', error);
      
      // Update file status to error
      setFiles(prev => 
        prev.map(f => 
          f.id === fileData.id 
            ? { 
                ...f, 
                status: 'error', 
                errorMessage: error instanceof Error ? error.message : 'Upload failed'
              } 
            : f
        )
      );
    }
  };
  
  // Upload all pending files
  const handleUploadAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    if (pendingFiles.length === 0) {
      setError('No files to upload');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Upload files one by one (you could also do parallel uploads)
      for (const file of pendingFiles) {
        await uploadSingleFile(file);
      }
      
      setSuccessMessage(`Successfully uploaded ${pendingFiles.length} file(s)`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (error) {
      setError('Some files failed to upload');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== FILE MANAGEMENT FUNCTIONS ====================
  
  // Remove a file from the list
  const handleRemoveFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    
    // Clear error if it was related to this file
    setError(null);
  };
  
  // Retry uploading a failed file
  const handleRetryFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      await uploadSingleFile(file);
    }
  };
  
  // Clear all files
  const handleClearAll = () => {
    setFiles([]);
    setError(null);
    setSuccessMessage(null);
  };

  // ==================== COMPONENT RENDER ====================
  
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      {/* Page container with light background */}
      
      <div className="max-w-4xl mx-auto">
        {/* Center content with max width constraint */}
        
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            File Transfer
          </h1>
          <p className="text-gray-600">
            Upload files securely to share with others
          </p>
        </div>

        {/* Main Upload Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          
          {/* Upload Area */}
          <div
            onClick={handleUploadAreaClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
              ${isDragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }
            `}
          >
            {/* Upload Icon */}
            <Upload className="mx-auto w-12 h-12 text-gray-400 mb-4" />
            
            {/* Upload Instructions */}
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-700">
                Drop files here or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports: Images, PDFs, Documents, Archives (Max 10MB each)
              </p>
            </div>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              accept="image/*,.pdf,.txt,.doc,.docx,.zip,.rar,.mp3,.mp4,.mov"
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {successMessage && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                <p className="text-green-700 text-sm">{successMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            
            {/* Files Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Files ({files.length})
              </h2>
              
              <div className="flex space-x-3">
                {/* Upload All Button */}
                <button
                  onClick={handleUploadAll}
                  disabled={isLoading || !files.some(f => f.status === 'pending')}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>Upload All</span>
                </button>
                
                {/* Clear All Button */}
                <button
                  onClick={handleClearAll}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {/* Files List */}
            <div className="space-y-3">
              {files.map(file => (
                <FileItem
                  key={file.id}
                  file={file}
                  onRemove={handleRemoveFile}
                  onRetry={handleRetryFile}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== FILE ITEM COMPONENT ====================

// Individual file component - shows file details, progress, and actions
const FileItem: React.FC<FileItemProps> = ({ file, onRemove, onRetry }) => {
  
  // Convert file size from bytes to human-readable format (copied from parent component)
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Get appropriate icon for file type
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word')) return '📝';
    if (type.includes('zip') || type.includes('rar')) return '🗜️';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('video/')) return '🎬';
    return '📎';
  };
  
  // Get status color for visual feedback
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'uploading': return 'text-blue-500';
      case 'completed': return 'text-green-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };
  
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        
        {/* File Info */}
        <div className="flex items-center space-x-3 flex-1">
          {/* File Icon */}
          <div className="text-2xl">
            {getFileIcon(file.type)}
          </div>
          
          {/* File Details */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {file.name}
            </p>
            <p className="text-sm text-gray-500">
              {formatFileSize(file.size)} • {file.type}
            </p>
          </div>
        </div>

        {/* Status and Actions */}
        <div className="flex items-center space-x-3">
          
          {/* Upload Progress */}
          {file.status === 'uploading' && (
            <div className="flex items-center space-x-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${file.uploadProgress}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-500">
                {file.uploadProgress}%
              </span>
            </div>
          )}
          
          {/* Status Indicator */}
          <div className={`flex items-center space-x-1 ${getStatusColor(file.status)}`}>
            {file.status === 'completed' && <CheckCircle className="w-4 h-4" />}
            {file.status === 'error' && <AlertCircle className="w-4 h-4" />}
            {file.status === 'uploading' && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            )}
            <span className="text-sm font-medium capitalize">
              {file.status}
            </span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-1">
            {/* View/Download Button (only for completed files) */}
            {file.status === 'completed' && file.uploadedUrl && (
              <>
                <button
                  onClick={() => window.open(file.uploadedUrl, '_blank')}
                  className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                  title="View file"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <a
                  href={file.uploadedUrl}
                  download={file.name}
                  className="p-2 text-gray-400 hover:text-green-500 transition-colors"
                  title="Download file"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            )}
            
            {/* Retry Button (only for failed files) */}
            {file.status === 'error' && (
              <button
                onClick={() => onRetry(file.id)}
                className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                title="Retry upload"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
            
            {/* Remove Button */}
            <button
              onClick={() => onRemove(file.id)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Error Message */}
      {file.status === 'error' && file.errorMessage && (
        <div className="mt-2 text-sm text-red-600">
          Error: {file.errorMessage}
        </div>
      )}
    </div>
  );
};

export default FileUploadPage;