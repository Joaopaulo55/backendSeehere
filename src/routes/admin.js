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