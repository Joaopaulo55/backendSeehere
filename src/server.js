import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload.js';

// Import routes
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import collectionRoutes from './routes/collections.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;



// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware

app.use(cors({
    origin: [
        'https://seehere3.netlify.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(helmet());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rota de health check do MEGA
app.get('/api/health/mega', async (req, res) => {
  try {
    const health = await megaService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Rota de teste de conexão MEGA
app.get('/api/test-mega', async (req, res) => {
  try {
    const isConnected = await megaService.ensureConnection();
    const storageInfo = await megaService.getStorageInfo();
    
    res.json({
      success: true,
      connected: isConnected,
      storage: storageInfo,
      message: 'Conexão MEGA funcionando!'
    });
  } catch (error) {
    res.json({
      success: false,
      connected: false,
      error: error.message
    });
  }
});

// Rota para listar arquivos no MEGA (útil para debug)
app.get('/api/mega-files', async (req, res) => {
  try {
    const files = await megaService.listFiles('/');
    res.json({
      success: true,
      files: files
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      files: []
    });
  }
});




// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Seehere backend running on port ${PORT}`);
});