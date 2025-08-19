// Load environment variables first
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Initialize Express app
const app = express();

// ==================== CONFIGURATION ====================

const config = {
  PORT: process.env.FILE_SERVER_PORT || 5000,
  // Use the same JWT secrets as your auth server
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'fallback_secret_for_development_only',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'fallback_refresh_secret_for_development_only',
  UPLOAD_DIR: path.join(__dirname, 'uploads'),
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES_PER_USER: 50,
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Audio/Video
    'audio/mpeg', 'audio/wav', 'video/mp4', 'video/quicktime', 'video/x-msvideo'
  ]
};

// ==================== MIDDLEWARE ====================

// Enable CORS for your frontend - fixed the typo in your original
app.use(cors({
  origin: [
    'http://localhost:3000', // Frontend
    'http://localhost:3001'  // Alternative frontend port
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 uploads per windowMs
  message: 'Too many upload attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 downloads per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== STORAGE CONFIGURATION ====================

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.access(config.UPLOAD_DIR);
  } catch {
    await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(config.UPLOAD_DIR, String(req.user.id));
    
    // Create user-specific directory if it doesn't exist
    if (!fsSync.existsSync(userDir)) {
      fsSync.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp + random + original extension
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}_${uniqueSuffix}${ext}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  if (config.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE,
    files: 10 // Max 10 files at once
  },
  fileFilter: fileFilter
});

// ==================== AUTH MIDDLEWARE ====================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Use the same ACCESS_TOKEN_SECRET as your auth server
    const decoded = jwt.verify(token, config.ACCESS_TOKEN_SECRET);
    
    // Match the payload structure from your auth server
    // Your auth server uses: { name: user.username, id: user.id }
    req.user = {
      id: decoded.id,
      username: decoded.name // Note: your auth server stores username as 'name'
    };
    
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    
    return res.status(403).json({ error: 'Invalid access token' });
  }
};

// ==================== DATABASE SIMULATION ====================
// In production, replace this with actual database operations

// Simple in-memory storage for file metadata
// In production, use a real database like PostgreSQL, MongoDB, etc.
const fileDatabase = new Map();

const saveFileMetadata = async (fileData) => {
  const id = crypto.randomBytes(16).toString('hex');
  const metadata = {
    id,
    ...fileData,
    uploadedAt: new Date().toISOString()
  };
  
  fileDatabase.set(id, metadata);
  return metadata;
};

const getFileMetadata = async (fileId) => {
  return fileDatabase.get(fileId);
};

const getUserFiles = async (userId) => {
  const userFiles = [];
  // Convert userId to string for consistent comparison
  const userIdString = String(userId);
  
  for (const [id, file] of fileDatabase.entries()) {
    if (String(file.userId) === userIdString) {
      userFiles.push(file);
    }
  }
  return userFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
};

const deleteFileMetadata = async (fileId) => {
  return fileDatabase.delete(fileId);
};

// ==================== UTILITY FUNCTIONS ====================

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const generateShareToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ==================== API ROUTES ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'File Upload Server',
    timestamp: new Date().toISOString()
  });
});

// Upload single or multiple files
app.post('/api/files/upload', uploadLimiter, authenticateToken, upload.array('file', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Check user file count limit
    const userFiles = await getUserFiles(req.user.id);
    if (userFiles.length + req.files.length > config.MAX_FILES_PER_USER) {
      // Clean up uploaded files
      for (const file of req.files) {
        await fs.unlink(file.path).catch(console.error);
      }
      return res.status(400).json({ 
        error: `File limit exceeded. Maximum ${config.MAX_FILES_PER_USER} files per user.` 
      });
    }

    const uploadedFiles = [];
    
    for (const file of req.files) {
      // Save file metadata to database
      const fileMetadata = await saveFileMetadata({
        userId: req.user.id,
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        shareToken: generateShareToken()
      });
      
      uploadedFiles.push({
        id: fileMetadata.id,
        originalName: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        sizeFormatted: formatFileSize(file.size),
        fileUrl: `/api/files/download/${fileMetadata.id}`,
        shareUrl: `/api/files/share/${fileMetadata.shareToken}`,
        uploadedAt: fileMetadata.uploadedAt
      });
    }

    res.status(201).json({
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up any uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(console.error);
      }
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `File too large. Maximum size is ${formatFileSize(config.MAX_FILE_SIZE)}` 
      });
    }
    
    if (error.message.includes('File type')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get user's files
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const files = await getUserFiles(req.user.id);
    
    const filesWithUrls = files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      sizeFormatted: formatFileSize(file.size),
      fileUrl: `/api/files/download/${file.id}`,
      shareUrl: `/api/files/share/${file.shareToken}`,
      uploadedAt: file.uploadedAt
    }));
    
    res.json({ files: filesWithUrls });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

// Download file (authenticated)
app.get('/api/files/download/:fileId', downloadLimiter, authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileMetadata = await getFileMetadata(fileId);
    
    if (!fileMetadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if user owns the file
    if (String(fileMetadata.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists on disk
    try {
      await fs.access(fileMetadata.path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.originalName}"`);
    res.setHeader('Content-Type', fileMetadata.mimetype);
    
    // Send file
    res.sendFile(path.resolve(fileMetadata.path));
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Share file (public access with token)
app.get('/api/files/share/:shareToken', downloadLimiter, async (req, res) => {
  try {
    const { shareToken } = req.params;
    
    // Find file by share token
    let fileMetadata = null;
    for (const [id, file] of fileDatabase.entries()) {
      if (file.shareToken === shareToken) {
        fileMetadata = file;
        break;
      }
    }
    
    if (!fileMetadata) {
      return res.status(404).json({ error: 'Shared file not found or link expired' });
    }
    
    // Check if file exists on disk
    try {
      await fs.access(fileMetadata.path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.originalName}"`);
    res.setHeader('Content-Type', fileMetadata.mimetype);
    
    // Send file
    res.sendFile(path.resolve(fileMetadata.path));
    
  } catch (error) {
    console.error('Share download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file
app.delete('/api/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileMetadata = await getFileMetadata(fileId);
    
    if (!fileMetadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if user owns the file
    if (String(fileMetadata.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete file from disk
    try {
      await fs.unlink(fileMetadata.path);
    } catch (error) {
      console.warn('File not found on disk:', error.message);
    }
    
    // Delete metadata from database
    await deleteFileMetadata(fileId);
    
    res.json({ message: 'File deleted successfully' });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get file info (without downloading)
app.get('/api/files/info/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileMetadata = await getFileMetadata(fileId);
    
    if (!fileMetadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if user owns the file
    if (String(fileMetadata.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      id: fileMetadata.id,
      originalName: fileMetadata.originalName,
      filename: fileMetadata.filename,
      size: fileMetadata.size,
      sizeFormatted: formatFileSize(fileMetadata.size),
      mimetype: fileMetadata.mimetype,
      uploadedAt: fileMetadata.uploadedAt,
      fileUrl: `/api/files/download/${fileMetadata.id}`,
      shareUrl: `/api/files/share/${fileMetadata.shareToken}`
    });
    
  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `File too large. Maximum size is ${formatFileSize(config.MAX_FILE_SIZE)}` 
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files at once' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404s
app.use('/*path', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ==================== STARTUP ====================

const startServer = async () => {
  try {
    // Check for required environment variables
    if (!process.env.ACCESS_TOKEN_SECRET) {
      console.warn('⚠️  Warning: ACCESS_TOKEN_SECRET not set in environment variables');
      console.warn('⚠️  Using fallback secret - NOT SECURE FOR PRODUCTION!');
    }
    
    // Ensure upload directory exists
    await ensureUploadDir();
    
    console.log(`📁 Upload directory ready: ${config.UPLOAD_DIR}`);
    
    // Start server
    app.listen(config.PORT, () => {
      console.log(`🚀 File Upload Server running on port ${config.PORT}`);
      console.log(`📋 Health check: http://localhost:${config.PORT}/api/health`);
      console.log(`📤 Upload endpoint: http://localhost:${config.PORT}/api/files/upload`);
      console.log(`📂 Max file size: ${formatFileSize(config.MAX_FILE_SIZE)}`);
      console.log(`👤 Max files per user: ${config.MAX_FILES_PER_USER}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();