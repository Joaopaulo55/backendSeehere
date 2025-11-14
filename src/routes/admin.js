import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

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


// Adicione estas rotas ao arquivo admin.js

// Get MEGA files not in database
router.get('/mega-videos', async (req, res) => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const megaService = await import('../services/megaService.js').then(m => m.default);
    
    // Use a nova função específica
    const megaFiles = await megaService.listVideosInFolder('Mega/seehere-videos');
    
    console.log(`📊 Total de arquivos encontrados no MEGA: ${megaFiles.length}`);
    
    // Get all videos from MEGA
    const megaFiles = await megaService.listAllVideoFiles();
    
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
    console.error('Error fetching MEGA videos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch MEGA videos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Import video from MEGA to database
router.post('/import-mega-video', async (req, res) => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const megaService = await import('../services/megaService.js').then(m => m.default);
    
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
      durationSeconds: 0, // Você pode extrair isso depois usando ffmpeg ou similar
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
    const { name, description, thumbnailUrl, isFeatured } = req.body;

    const collection = await prisma.collection.create({
      data: {
        name,
        description,
        thumbnailUrl,
        isFeatured: isFeatured || false,
        createdById: req.user.id
      }
    });

    res.status(201).json({ collection });
  } catch (error) {
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