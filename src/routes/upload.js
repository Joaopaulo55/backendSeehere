// upload.js - VERSÃO COMPLETAMENTE CORRIGIDA
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import megaService from '../services/megaService.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js'; // ✅ IMPORT DIRETO
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Configurar multer
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
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de vídeo são permitidos'), false);
    }
  }
});

// Upload de vídeo - 🔥 CORREÇÃO COMPLETA
router.post('/video', 
  authenticateToken, 
  requireAdmin,
  upload.single('video'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      console.log('✅ Usuário autenticado para upload:', req.user.email);
      console.log('✅ Role do usuário:', req.user.role);

      const { title, description, tags, collectionId } = req.body;
      
      if (!title) {
        // Limpar arquivo temporário
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Título é obrigatório' });
      }

      console.log(`📥 Processando upload: ${req.file.originalname}`);

      // 1. Upload para MEGA
      const videoResult = await megaService.uploadFile(
        req.file.path, 
        `video-${Date.now()}-${req.file.originalname}`
      );

      console.log('✅ Upload MEGA concluído, salvando no banco...');

      // 2. Salvar no banco de dados - ✅ USA IMPORT DIRETO
      const videoData = {
        title,
        description: description || '',
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        megaFileId: videoResult.fileId,
        megaFileUrl: videoResult.downloadUrl,
        urlStream: videoResult.downloadUrl,
        urlDownload: videoResult.downloadUrl,
        thumbnailUrl: null,
        durationSeconds: 0,
        ownerId: req.user.id,
        isPublished: true,
        metadata: {
          originalName: req.file.originalname,
          fileSize: videoResult.size,
          uploadedAt: new Date().toISOString()
        }
      };

      const video = await prisma.video.create({
        data: videoData,
        include: {
          owner: {
            select: { displayName: true }
          }
        }
      });

      // 3. Adicionar à coleção se especificada
      if (collectionId) {
        await prisma.collectionVideo.create({
          data: {
            collectionId,
            videoId: video.id,
            position: 0
          }
        });
      }

      // 4. Limpar arquivo temporário
      try {
        fs.unlinkSync(req.file.path);
        console.log('🧹 Arquivo temporário removido');
      } catch (cleanupError) {
        console.warn('⚠️ Não foi possível remover arquivo temporário');
      }

      console.log('✅ Vídeo criado com sucesso no banco:', video.id);

      res.status(201).json({
        success: true,
        video,
        uploadInfo: {
          videoUrl: videoResult.downloadUrl,
          fileSize: videoResult.size
        }
      });

    } catch (error) {
      console.error('❌ Erro no upload:', error);
      
      // Limpar arquivo temporário em caso de erro
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.warn('⚠️ Não foi possível limpar arquivo temporário');
        }
      }
      
      res.status(500).json({ 
        error: 'Falha no upload do vídeo',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;