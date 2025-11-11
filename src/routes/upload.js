import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import megaService from '../services/megaService.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Configurar multer para upload temporário
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limite
  },
  fileFilter: (req, file, cb) => {
    // Verificar tipo de arquivo
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de vídeo e imagem são permitidos'), false);
    }
  }
});

// Função para gerar thumbnail do vídeo
function generateThumbnail(videoPath, outputPath, timestamp = '00:00:05') {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '640x360'
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

// Upload de vídeo com thumbnail automática
router.post('/video', authenticateToken, requireAdmin, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { title, description, tags, collectionId } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    console.log(`📥 Processando upload: ${req.file.originalname}`);

    // 1. Upload do vídeo para MEGA
    const videoResult = await megaService.uploadFile(
      req.file.path, 
      `video-${Date.now()}-${req.file.originalname}`
    );

    // 2. Gerar thumbnail automaticamente
    let thumbnailResult = null;
    try {
      const thumbnailPath = path.join(path.dirname(req.file.path), `thumb-${Date.now()}.jpg`);
      await generateThumbnail(req.file.path, thumbnailPath);
      
      thumbnailResult = await megaService.uploadFile(
        thumbnailPath,
        `thumb-${Date.now()}.jpg`
      );
    } catch (thumbError) {
      console.warn('⚠️ Não foi possível gerar thumbnail:', thumbError);
    }

    // 3. Salvar no banco de dados
    const { prisma } = await import('../lib/prisma.js');
    
    const video = await prisma.video.create({
      data: {
        title,
        description: description || '',
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        megaFileId: videoResult.fileId,
        megaFileUrl: videoResult.downloadUrl,
        urlStream: videoResult.downloadUrl,
        urlDownload: videoResult.downloadUrl,
        thumbnailUrl: thumbnailResult?.downloadUrl || null,
        durationSeconds: 0, // Poderia extrair com ffmpeg
        ownerId: req.user.id,
        isPublished: true,
        metadata: {
          originalName: req.file.originalname,
          fileSize: videoResult.size,
          uploadedAt: new Date().toISOString()
        }
      },
      include: {
        owner: {
          select: { displayName: true }
        }
      }
    });

    // 4. Adicionar à coleção se especificada
    if (collectionId) {
      await prisma.collectionVideo.create({
        data: {
          collectionId,
          videoId: video.id,
          position: 0
        }
      });
    }

    res.status(201).json({
      success: true,
      video,
      uploadInfo: {
        videoUrl: videoResult.downloadUrl,
        thumbnailUrl: thumbnailResult?.downloadUrl,
        fileSize: videoResult.size
      }
    });

  } catch (error) {
    console.error('❌ Erro no upload:', error);
    res.status(500).json({ 
      error: 'Falha no upload do vídeo',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Upload apenas de thumbnail
router.post('/thumbnail', authenticateToken, requireAdmin, upload.single('thumbnail'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    const thumbnailResult = await megaService.uploadFile(
      req.file.path,
      `thumb-${Date.now()}-${req.file.originalname}`
    );

    res.json({
      success: true,
      thumbnailUrl: thumbnailResult.downloadUrl
    });

  } catch (error) {
    console.error('❌ Erro no upload da thumbnail:', error);
    res.status(500).json({ error: 'Falha no upload da thumbnail' });
  }
});

export default router;

