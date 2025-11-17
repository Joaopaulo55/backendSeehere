// admin.js - VERSÃO COMPLETAMENTE CORRIGIDA
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import megaService from '../services/megaService.js'; // ✅ IMPORT DIRETO

const router = express.Router();

// ✅ MIDDLEWARES GLOBAIS CORRETOS
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalVideos,
      totalUsers,
      totalViews,
      recentVideos
    ] = await Promise.all([
      prisma.video.count(),
      prisma.user.count(),
      prisma.video.aggregate({ _sum: { viewsCount: true } }),
      prisma.video.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { displayName: true }
          }
        }
      })
    ]);

    res.json({
      stats: {
        totalVideos,
        totalUsers,
        totalViews: totalViews._sum.viewsCount || 0,
        recentVideos
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get MEGA files not in database - 🔥 CORREÇÃO COMPLETA
router.get('/mega-videos', async (req, res) => {
  try {
    console.log('🔐 Usuário autenticado para MEGA videos:', req.user.email);
    
    console.log('🔍 Buscando vídeos no MEGA...');
    
    let megaFiles = [];
    
    try {
      // Primeiro tenta na pasta específica
      console.log('🔍 Buscando na pasta específica...');
      megaFiles = await megaService.listVideosInFolder('Mega/seehere-videos');
      
      // Se não encontrar, busca em todas as pastas
      if (megaFiles.length === 0) {
        console.log('🔍 Nenhum vídeo na pasta específica, buscando em todas as pastas...');
        megaFiles = await megaService.listAllVideoFilesRecursive();
      }
      
      console.log(`📊 Total de arquivos encontrados: ${megaFiles.length}`);
      
    } catch (megaError) {
      console.error('❌ Erro ao buscar no MEGA:', megaError.message);
      
      // Se der erro de bloqueio, retorna dados vazios mas sucesso
      if (megaError.message.includes('blocked') || megaError.message.includes('EBLOCKED')) {
        return res.json({
          success: true,
          notInDatabase: [],
          alreadyInDatabase: [],
          stats: {
            totalInMega: 0,
            notImported: 0,
            alreadyImported: 0
          },
          message: 'Conta MEGA temporariamente bloqueada. Tente novamente mais tarde.'
        });
      }
      
      // Se for outro erro, tenta a busca recursiva como fallback
      console.log('🔄 Tentando busca recursiva como fallback...');
      try {
        megaFiles = await megaService.listAllVideoFilesRecursive();
        console.log(`📊 Fallback: ${megaFiles.length} arquivos encontrados`);
      } catch (fallbackError) {
        console.error('❌ Fallback também falhou:', fallbackError.message);
        throw new Error(`Falha na conexão com MEGA: ${megaError.message}`);
      }
    }
    
    // Get all videos from database to check which ones are already imported
    const dbVideos = await prisma.video.findMany({
      select: { megaFileId: true, title: true }
    });
    
    const dbFileIds = dbVideos.map(video => video.megaFileId);
    
    // Mark which files are already in database
    const megaFilesWithStatus = megaFiles.map(file => ({
      ...file,
      isInDatabase: dbFileIds.includes(file.downloadId),
      existingTitle: dbVideos.find(v => v.megaFileId === file.downloadId)?.title || null
    }));
    
    // Separate files
    const notInDatabase = megaFilesWithStatus.filter(file => !file.isInDatabase);
    const alreadyInDatabase = megaFilesWithStatus.filter(file => file.isInDatabase);
    
    console.log(`✅ Não importados: ${notInDatabase.length}, Já importados: ${alreadyInDatabase.length}`);
    
    res.json({
      success: true,
      notInDatabase,
      alreadyInDatabase,
      stats: {
        totalInMega: megaFiles.length,
        notImported: notInDatabase.length,
        alreadyImported: alreadyInDatabase.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching MEGA videos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch MEGA videos',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Import video from MEGA to database - 🔥 CORREÇÃO
router.post('/import-mega-video', async (req, res) => {
  try {
    console.log('📥 Importando vídeo do MEGA...');
    
    const {
      megaFileId,
      title,
      description,
      tags,
      thumbnailUrl,
      collectionId
    } = req.body;

    if (!megaFileId || !title) {
      return res.status(400).json({ 
        success: false,
        error: 'MEGA file ID and title are required' 
      });
    }

    // Verify file exists in MEGA and get download URL
    const downloadUrl = await megaService.getFileDownloadLink(megaFileId);
    
    // Create video in database
    const videoData = {
      title,
      description: description || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : [],
      megaFileId,
      megaFileUrl: downloadUrl,
      urlStream: downloadUrl,
      urlDownload: downloadUrl,
      thumbnailUrl: thumbnailUrl || null,
      durationSeconds: 0,
      ownerId: req.user.id,
      isPublished: true,
      metadata: {
        importedFromMega: true,
        importedAt: new Date().toISOString()
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

    // Add to collection if specified
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
    console.error('Error importing MEGA video:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to import video from MEGA',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create video
router.post('/videos', async (req, res) => {
  try {
    const {
      title,
      description,
      tags,
      megaFileId,
      megaFileUrl,
      urlStream,
      urlDownload,
      thumbnailUrl,
      durationSeconds,
      collections
    } = req.body;

    const video = await prisma.video.create({
      data: {
        title,
        description,
        tags: tags || [],
        megaFileId,
        megaFileUrl,
        urlStream: urlStream || megaFileUrl,
        urlDownload: urlDownload || megaFileUrl,
        thumbnailUrl,
        durationSeconds: parseInt(durationSeconds),
        ownerId: req.user.id,
        isPublished: true,
        metadata: {}
      },
      include: {
        owner: {
          select: { displayName: true }
        }
      }
    });

    // Add to collections if specified
    if (collections && collections.length > 0) {
      await Promise.all(
        collections.map((collectionId, index) =>
          prisma.collectionVideo.create({
            data: {
              collectionId,
              videoId: video.id,
              position: index
            }
          })
        )
      );
    }

    res.status(201).json({ video });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create video' });
  }
});

// Get all videos for admin
router.get('/videos', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const videos = await prisma.video.findMany({
      include: {
        owner: {
          select: { displayName: true }
        },
        collections: {
          include: {
            collection: true
          }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.video.count();

    res.json({
      videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Create collection
router.post('/collections', async (req, res) => {
  try {
    console.log('🔐 Usuário criando coleção:', req.user.email);
    
    const { name, description, thumbnailUrl, isFeatured } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    const collection = await prisma.collection.create({
      data: {
        name,
        description: description || '',
        thumbnailUrl: thumbnailUrl || null,
        isFeatured: isFeatured || false,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { displayName: true }
        }
      }
    });

    console.log('✅ Coleção criada com sucesso:', collection.id);

    res.status(201).json({ collection });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

// Get all collections for admin
router.get('/collections', async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      include: {
        createdBy: {
          select: { displayName: true }
        },
        _count: {
          select: { videos: true, favorites: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

export default router;