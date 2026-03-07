import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as bosService from './bosService.js';
import * as dbService from './dbService.js';
import { INITIAL_ASSETS } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Load environment variables from specific path (root directory)
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = 3001;
const API_TOKEN = process.env.VITE_API_TOKEN;

// Initialize Services
const initializeServices = async () => {
    // BOS Service
    try {
        bosService.init({
            endpoint: process.env.BOS_ENDPOINT, 
            ak: process.env.BOS_AK,
            sk: process.env.BOS_SK,
            bucket: process.env.BOS_BUCKET
        });
    } catch (error) {
        console.error('[Backend] Failed to initialize BOS Service:', error.message);
    }
    
    // DB Service (SQLite via Prisma)
    try {
        await dbService.connect();
        await dbService.seedData(INITIAL_ASSETS);
        // Note: With Prisma + SQLite, connection is file-based.
        // Data will be stored in prisma/dev.db by default.
    } catch (error) {
        console.error('[Backend] Failed to initialize DB Service:', error.message);
    }
};

initializeServices();

// Enable CORS for frontend
app.use(cors());

// Parse JSON bodies (limit increased for base64 image uploads)
app.use(bodyParser.json({ limit: '10mb' }));

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // No token present

  if (token !== API_TOKEN) {
    console.log(`[Backend] Auth failed.`);
    return res.sendStatus(403); // Invalid token
  }

  next();
};

// Endpoint to handle asset download
app.post('/api/download-asset', authenticateToken, async (req, res) => {
  const { urdfPath } = req.body;

  if (!urdfPath) {
     return res.status(400).json({ success: false, message: 'urdfPath is required' });
  }

  try {
      const files = await bosService.listFiles(urdfPath);

      res.json({  
          success: true, 
          message: 'Files listed successfully',
          data: {
              files: files
          }
      });
  } catch (error) {
      console.error('[Backend] Error generating download URL:', error);
      res.status(500).json({ success: false, message: 'Failed to generate download URL' });
  }
});

// Endpoint to get a signed URL for a single file
app.post('/api/get-signed-url', authenticateToken, async (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
     return res.status(400).json({ success: false, message: 'filePath is required' });
  }

  try {
      const downloadUrl = await bosService.getSignedUrl(filePath);

      res.json({ 
          success: true, 
          message: 'URL generated successfully',
          data: {
              url: downloadUrl
          }
      });
  } catch (error) {
      console.error('[Backend] Error generating signed URL:', error);
      res.status(500).json({ success: false, message: 'Failed to generate signed URL' });
  }
});

// Endpoint to avoid CORS problems)
app.post('/api/upload-file', authenticateToken, async (req, res) => {
  const { filePath, content, secret } = req.body;

  if (!filePath || !content) {
     return res.status(400).json({ success: false, message: 'filePath and content are required' });
  }

  // Security: Require Upload Secret
  if (secret !== process.env.UPLOAD_SECRET) {
      console.warn(`[Backend Security] Upload attempt with invalid secret`);
      return res.status(403).json({ success: false, message: 'Invalid upload secret' });
  }

  try {
      await bosService.uploadFile(filePath, content);

      res.json({ 
          success: true, 
          message: 'File uploaded successfully'
      });
  } catch (error) {
      console.error('[Backend] Error uploading file:', error);
      res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
});

// Endpoint to get all assets
app.get('/api/assets', authenticateToken, async (req, res) => {
    try {
        const assets = await dbService.getAllAssets();
        res.json({
            success: true,
            data: { assets }
        });
    } catch (error) {
        console.error('[Backend] Error fetching assets:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch assets' });
    }
});


app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
