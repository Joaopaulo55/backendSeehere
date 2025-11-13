import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload.js';

// Import routes
import megaService from './services/megaService.js';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import collectionRoutes from './routes/collections.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 CORREÇÃO: Configurar trust proxy ANTES do rate limiting
app.set('trust proxy', 1); // Para 1 proxy reverso (Render, Netlify, etc.)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
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
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Para permitir recursos de diferentes origens
}));
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

// Health check básico
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota de health check do MEGA
app.get('/api/health/mega', async (req, res) => {
  try {
    console.log('🔍 Health check do MEGA solicitado...');
    const health = await megaService.healthCheck();
    
    res.json({
      ...health,
      serverTime: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('❌ Erro no health check do MEGA:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      serverTime: new Date().toISOString()
    });
  }
});

// Rota de teste de conexão MEGA
app.get('/api/test-mega', async (req, res) => {
  try {
    console.log('🧪 Teste de conexão MEGA iniciado...');
    
    await megaService.ensureConnection();
    const storageInfo = await megaService.getStorageInfo();
    const accountStatus = await megaService.checkAccountStatus();
    
    res.json({
      success: true,
      connected: true,
      storage: storageInfo,
      accountStatus: accountStatus,
      message: 'Conexão MEGA funcionando perfeitamente! ✅'
    });
  } catch (error) {
    console.error('❌ Teste de conexão MEGA falhou:', error.message);
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
      message: 'Falha na conexão com MEGA ❌'
    });
  }
});

// Rota para resetar conexão MEGA
app.post('/api/reset-mega-connection', async (req, res) => {
  try {
    console.log('🔄 Resetando conexão MEGA...');
    
    await megaService.resetConnection();
    
    res.json({
      success: true,
      message: 'Conexão MEGA resetada com sucesso! 🔄'
    });
  } catch (error) {
    console.error('❌ Erro ao resetar conexão MEGA:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para listar arquivos no MEGA (útil para debug)
app.get('/api/mega-files', async (req, res) => {
  try {
    console.log('📁 Listando arquivos do MEGA...');
    
    const files = await megaService.listFiles();
    const videoFiles = await megaService.listAllVideoFiles();
    
    res.json({
      success: true,
      totalFiles: files.length,
      totalVideos: videoFiles.length,
      files: files.slice(0, 20), // Limitar para não sobrecarregar
      videoFiles: videoFiles.slice(0, 20)
    });
  } catch (error) {
    console.error('❌ Erro ao listar arquivos MEGA:', error.message);
    res.json({
      success: false,
      error: error.message,
      files: [],
      videoFiles: []
    });
  }
});

// Rota para informações de storage
app.get('/api/mega-storage', async (req, res) => {
  try {
    const storageInfo = await megaService.getStorageInfo();
    
    res.json({
      success: true,
      storage: storageInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Erro no servidor:', err.stack);
  
  // Verificar se é erro de rate limit
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Limite de requisições excedido',
      message: 'Muitas requisições em um curto período. Tente novamente em 15 minutos.'
    });
  }
  
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Entre em contato com o suporte'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Desligando servidor gracefuly...');
  try {
    await megaService.disconnect();
    console.log('✅ Servidor desligado com sucesso');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao desligar servidor:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🔄 Desligando servidor (SIGTERM)...');
  try {
    await megaService.disconnect();
    console.log('✅ Servidor desligado com sucesso');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao desligar servidor:', error);
    process.exit(1);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Seehere backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 MEGA Health: http://localhost:${PORT}/api/health/mega`);
  
  // Inicialização assíncrona do MEGA
  setTimeout(async () => {
    try {
      console.log('🔄 Iniciando conexão MEGA...');
      await megaService.ensureConnection();
      console.log('✅ MEGA conectado e pronto!');
    } catch (error) {
      console.warn('⚠️ MEGA não conectado na inicialização, mas servidor rodando:', error.message);
    }
  }, 8000); // Delay maior para garantir que o servidor esteja estável
});