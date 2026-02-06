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
        
        // If no timestamp provided, use current time
        if (!dateObj) {
            dateObj = new Date();
        } else if (!(dateObj instanceof Date)) {
             // If it's a number/string, parse it
             dateObj = new Date(dateObj);
        }
        
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

// Parse JSON bodies
app.use(bodyParser.json());

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // No token present

  if (token !== API_TOKEN) {
    console.log(`[Backend] Auth failed. Received: ${token}, Expected: ${API_TOKEN}`);
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
      
      // Clean up path and append test.urdf
      // Ensures we don't have double slashes if prefix ends with /
      const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      const objectKey = `${cleanPrefix}/urdf/go2_description.urdf`;

      console.log(`[Backend] Generating presigned URL for: ${objectKey}`);

      // Generate presigned URL (expires in 1800s - 30 mins)
      const downloadUrl = client.generatePresignedUrl(bucketName, objectKey, {
          expirationInSeconds: 1800
      });

      console.log(`[Backend] Generated URL: ${downloadUrl}`);

      res.json({ 
          success: true, 
          message: 'Download URL generated successfully',
          data: {
              downloadUrl: downloadUrl,
              expiresIn: 1800
          }
      });
  } catch (error) {
      console.error('[Backend] Error generating download URL:', error);
      res.status(500).json({ success: false, message: 'Failed to generate download URL' });
  }
});


app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
