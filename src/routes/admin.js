// admin.js - VERSÃO COMPLETAMENTE CORRIGIDA
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import megaService from '../services/megaService.js';

const router = express.Router();

// ✅ MIDDLEWARES GLOBAIS CORRETOS - APENAS PARA ROTAS ADMIN
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
      success: true,
      stats: {
        totalVideos,
        totalUsers,
        totalViews: totalViews._sum.viewsCount || 0,
        recentVideos
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// Get MEGA files not in database
router.get('/mega-videos', async (req, res) => {
  try {
    console.log('🔐 Usuário autenticado para MEGA videos:', req.user.email);
    
    console.log('🔍 Buscando vídeos no MEGA...');
    
    let megaFiles = [];
    
    try {
      // Tentar busca recursiva primeiro
      console.log('🔍 Buscando vídeos recursivamente...');
      megaFiles = await megaService.listAllVideoFilesRecursive();
      
      console.log(`📊 Total de arquivos encontrados: ${megaFiles.length}`);
      
      // Se não encontrar, tentar pasta específica
      if (megaFiles.length === 0) {
        console.log('🔍 Nenhum vídeo encontrado recursivamente, tentando pasta específica...');
        megaFiles = await megaService.listVideosInFolder('Mega/seehere-videos');
      }
      
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
      
      throw new Error(`Falha na conexão com MEGA: ${megaError.message}`);
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

// Import video from MEGA to database
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

    res.status(201).json({ success: true, video });
  } catch (error) {
    console.error('Error creating video:', error);
    res.status(500).json({ success: false, error: 'Failed to create video' });
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
      success: true,
      videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});

// Create collection
router.post('/collections', async (req, res) => {
  try {
    console.log('🔐 Usuário criando coleção:', req.user.email);
    console.log('👤 Role do usuário:', req.user.role);
    
    const { name, description, thumbnailUrl, isFeatured } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Collection name is required' });
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
        },
        _count: {
          select: { videos: true, favorites: true }
        }
      }
    });

    console.log('✅ Coleção criada com sucesso:', collection.id);

    res.status(201).json({ success: true, collection });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ success: false, error: 'Failed to create collection' });
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

    res.json({ success: true, collections });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch collections' });
  }
});

// 🔥 NOVAS ROTAS ESSENCIAIS ADICIONADAS:

// Get all users for admin
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            videos: true,
            comments: true,
            likes: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Update user role
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, displayName, isActive } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role,
        displayName,
        isActive: isActive !== undefined ? isActive : true
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// Emergency fix user role
router.post('/emergency-fix-role', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true
      }
    });

    res.json({
      success: true,
      message: `User ${email} updated to ADMIN`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error fixing role:', error);
    res.status(500).json({ success: false, error: 'Failed to fix role' });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    // Simular configurações por enquanto
    const settings = {
      siteName: 'SeeHere Video Platform',
      siteDescription: 'Plataforma de compartilhamento de vídeos',
      allowRegistrations: true,
      maxFileSize: 500,
      allowedFormats: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
      maintenanceMode: false
    };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// Update system settings
router.put('/settings', async (req, res) => {
  try {
    const { siteName, siteDescription, allowRegistrations, maxFileSize, maintenanceMode } = req.body;

    // Aqui você pode salvar no banco quando criar a tabela SystemSettings
    const settings = {
      siteName: siteName || 'SeeHere Video Platform',
      siteDescription: siteDescription || 'Plataforma de compartilhamento de vídeos',
      allowRegistrations: allowRegistrations !== false,
      maxFileSize: parseInt(maxFileSize) || 500,
      maintenanceMode: maintenanceMode || false,
      updatedAt: new Date().toISOString()
    };

    res.json({ success: true, settings, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Get notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { userId: null }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

// 🔥 CORREÇÃO DEFINITIVA: ROTA PARA CORRIGIR ROLES
router.post('/fix-users-roles', async (req, res) => {
  try {
    console.log('🔧 Corrigindo roles dos usuários existentes...');
    
    // Lista de emails que devem ser ADMIN
    const adminEmails = [
      'admin@seehere.com',
      'superadmin@seehere.com',
      'emergency_admin@seehere.com',
      'admin_fixed@seehere.com',
      'superadmin_fixed@seehere.com',
      'admin_corrigido@seehere.com'
    ];
    
    const results = [];
    
    for (const email of adminEmails) {
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (user) {
        if (user.role !== 'ADMIN') {
          // Atualizar para ADMIN
          const updatedUser = await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' }
          });
          results.push({
            email,
            action: 'UPDATED',
            oldRole: user.role,
            newRole: 'ADMIN'
          });
          console.log(`✅ ${email} atualizado de ${user.role} para ADMIN`);
        } else {
          results.push({
            email, 
            action: 'ALREADY_ADMIN',
            role: 'ADMIN'
          });
          console.log(`✅ ${email} já é ADMIN`);
        }
      } else {
        results.push({
          email,
          action: 'NOT_FOUND'
        });
        console.log(`⚠️ ${email} não encontrado`);
      }
    }
    
    // Listar todos os usuários após correção
    const allUsers = await prisma.user.findMany({
      select: { email: true, role: true, displayName: true }
    });
    
    res.json({
      success: true,
      message: 'Roles corrigidas com sucesso',
      corrections: results,
      allUsers: allUsers
    });
    
  } catch (error) {
    console.error('❌ Erro ao corrigir roles:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao corrigir roles',
      details: error.message
    });
  }
});

export default router;