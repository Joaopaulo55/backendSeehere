// routes/megaRoutes.js
import express from 'express';
import { megaScanner } from '../services/megaScanner.js';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// 🔍 Scan de pasta MEGA
router.post('/scan-folder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { folderUrl } = req.body;

    if (!folderUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL da pasta MEGA é obrigatória'
      });
    }

    console.log('📂 Recebida requisição para scan:', folderUrl);

    const files = await megaScanner.scanMegaFolder(folderUrl);

    // Verificar quais arquivos já estão no banco
    const dbVideos = await prisma.video.findMany({
      select: { megaFileId: true, title: true }
    });
    
    const dbFileIds = dbVideos.map(video => video.megaFileId);
    
    // ✅ Lógica robusta de comparação
    const filesWithStatus = files.map(file => {
      // prioriza downloadId -> se não existir, usa downloadUrl
      const fileId = file.downloadId || file.downloadUrl || null;
      const isInDatabase = fileId ? dbFileIds.includes(fileId) : false;
      const existingVideo = dbVideos.find(v => v.megaFileId === fileId);
      
      return {
        ...file,
        isInDatabase,
        existingTitle: existingVideo?.title || null
      };
    });

    const notInDatabase = filesWithStatus.filter(file => !file.isInDatabase);
    const alreadyInDatabase = filesWithStatus.filter(file => file.isInDatabase);

    res.json({
      success: true,
      folderUrl,
      stats: {
        totalInMega: files.length,
        notImported: notInDatabase.length,
        alreadyImported: alreadyInDatabase.length
      },
      notInDatabase,
      alreadyInDatabase
    });

  } catch (error) {
    console.error('❌ Erro no scan da pasta:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao escanear pasta MEGA'
    });
  }
});

// 📥 Importar vídeo do MEGA
router.post('/import-video', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      megaFileId,
      downloadUrl,
      name,
      title,
      description,
      tags,
      thumbnailUrl,
      collectionId,
      size
    } = req.body;

    if (!megaFileId || !title) {
      return res.status(400).json({
        success: false,
        error: 'ID do arquivo MEGA e título são obrigatórios'
      });
    }

    console.log('📥 Importando vídeo:', { megaFileId, title });

    // Verificar se já existe
    const existingVideo = await prisma.video.findFirst({
      where: { megaFileId }
    });

    if (existingVideo) {
      return res.status(400).json({
        success: false,
        error: 'Este vídeo já foi importado'
      });
    }

    // Criar vídeo no banco
    const videoData = {
      title,
      description: description || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : [],
      megaFileId,
      megaFileUrl: downloadUrl,
      urlStream: downloadUrl, // Pode ser otimizado depois
      urlDownload: downloadUrl,
      thumbnailUrl: thumbnailUrl || generateDefaultThumbnail(title),
      durationSeconds: 0,
      ownerId: req.user.id,
      isPublished: true,
      metadata: {
        originalName: name,
        fileSize: size,
        importedFromMega: true,
        importedAt: new Date().toISOString(),
        source: 'mega_public_folder'
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

    // Adicionar à coleção se especificada
    if (collectionId) {
      await prisma.collectionVideo.create({
        data: {
          collectionId,
          videoId: video.id,
          position: 0
        }
      });
    }

    console.log('✅ Vídeo importado com sucesso:', video.id);

    res.status(201).json({
      success: true,
      video,
      message: 'Vídeo importado com sucesso do MEGA'
    });

  } catch (error) {
    console.error('❌ Erro ao importar vídeo:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao importar vídeo',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Gerar thumbnail padrão baseada no título
function generateDefaultThumbnail(title) {
  const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=${color}&color=fff&size=256&bold=true&font-size=0.33`;
}

// 📊 Status do serviço MEGA
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Testar com uma URL de exemplo ou verificar conectividade
    res.json({
      success: true,
      status: 'operational',
      method: 'public_folder_api',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: false,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;