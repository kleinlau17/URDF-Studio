import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { BosClient, Auth } = require('@baiducloud/sdk');

// --- WORKAROUND START ---
// Workaround for "RangeError: Invalid time value" in @baiducloud/sdk
// Patch Auth.prototype directly to fix all instances
if (Auth && Auth.prototype) {
    console.log('[Backend] Applying global patch to Auth.prototype.getTimestamp');
    Auth.prototype.getTimestamp = function(timestamp) {
        let dateObj = timestamp;
        
        dateObj = new Date();
        // Final safety check
        if (isNaN(dateObj.getTime())) {
            console.warn('[Backend Warning] Invalid date detected in SDK Auth, using current time fallback');
            dateObj = new Date();
        }

        // BOS requires ISO 8601 format: yyyy-mm-ddThh:mm:ssZ (no milliseconds)
        const iso = dateObj.toISOString().replace(/\.\d{3}/g, '');
        return iso;
    };
}
// --- WORKAROUND END ---

// Load environment variables from specific path (root directory)
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = 3001;
const API_TOKEN = process.env.VITE_API_TOKEN;

// Initialize BOS Client
const bosConfig = {
    endpoint: process.env.BOS_ENDPOINT, 
    credentials: {
        ak: process.env.BOS_AK,
        sk: process.env.BOS_SK
    }
};
const client = new BosClient(bosConfig);

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

// Endpoint to handle model download
app.post('/api/download-model', authenticateToken, async (req, res) => {
  const { urdfPath } = req.body;

  if (!urdfPath) {
     return res.status(400).json({ success: false, message: 'urdfPath is required' });
  }

  try {
      const bucketName = process.env.BOS_BUCKET;
      // Normalize urdfPath to remove leading slash
      const prefix = urdfPath.startsWith('/') ? urdfPath.slice(1) : urdfPath;
      
      // Ensure prefix ends with / to list all files in directory
      const dirPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

      console.log(`[Backend] Listing objects for prefix: ${dirPrefix}`);

      // List all objects under the prefix
      const response = await client.listObjects(bucketName, { prefix: dirPrefix });
      
      if (!response.body || !response.body.contents) {
          return res.json({ 
              success: true, 
              message: 'No files found', 
              data: { files: [] } 
          });
      }

      // Map to relative paths and generate presigned URLs
      const files = response.body.contents
        .map(item => {
            // Remove prefix to get relative path
            const relativePath = item.key.slice(dirPrefix.length);
            
            // Skip directory markers or empty names
            if (!relativePath) return null;

            // Use 1800s (30min) expiration to match server.js and avoid potential SDK timestamp issues with patch
            const downloadUrl = client.generatePresignedUrl(bucketName, item.key, {
                expirationInSeconds: 1800
            });

            return {
                path: relativePath,
                url: downloadUrl
            };
        })
        .filter(item => item !== null);

      console.log(`[Backend] Found ${files.length} files`);
      // console.log('[Backend] Generated files list:', JSON.stringify(files, null, 2));

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
      const bucketName = process.env.BOS_BUCKET;
      // Normalize filePath to remove leading slash
      const key = filePath.startsWith('/') ? filePath.slice(1) : filePath;

      console.log(`[Backend] Generating signed URL for single file: ${key}`);

      // Use 1800s (30min) expiration
      const downloadUrl = client.generatePresignedUrl(bucketName, key, {
          expirationInSeconds: 1800
      });

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

// Endpoint to upload a file (Server-side proxy to avoid CORS problems)
app.post('/api/upload-file', authenticateToken, async (req, res) => {
  const { filePath, content } = req.body;

  if (!filePath || !content) {
     return res.status(400).json({ success: false, message: 'filePath and content are required' });
  }

  try {
      const bucketName = process.env.BOS_BUCKET;
      // Normalize filePath to remove leading slash
      const key = filePath.startsWith('/') ? filePath.slice(1) : filePath;

      console.log(`[Backend] Uploading file to BOS: ${key}`);

      // Extract raw base64 data
      const base64Data = content.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Upload to BOS
      await client.putObject(bucketName, key, buffer, {
          'Content-Type': 'image/png'
      });

      res.json({ 
          success: true, 
          message: 'File uploaded successfully'
      });
  } catch (error) {
      console.error('[Backend] Error uploading file:', error);
      res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
});


app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
