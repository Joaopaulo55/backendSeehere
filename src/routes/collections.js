// collections.js - VERSÃO COMPLETAMENTE CORRIGIDA
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all collections - PÚBLICO
router.get('/', async (req, res) => {
  try {
    const { featured } = req.query;
    
    let where = {};
    if (featured === 'true') {
      where.isFeatured = true;
    }

    const collections = await prisma.collection.findMany({
      where,
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
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Create collection - ✅ CORREÇÃO DEFINITIVA
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔐 Usuário criando coleção:', req.user.email);
    console.log('👤 Role do usuário:', req.user.role);
    
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
        },
        _count: {
          select: { videos: true, favorites: true }
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

// Get single collection
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { displayName: true, avatarUrl: true }
        },
        videos: {
          include: {
            video: {
              include: {
                owner: {
                  select: { displayName: true }
                },
                _count: {
                  select: { likes: true, comments: true }
                }
              }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ collection });
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

// Favorite/unfavorite collection
router.post('/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingFavorite = await prisma.favoriteCollection.findUnique({
      where: { userId_collectionId: { userId, collectionId: id } }
    });

    if (existingFavorite) {
      // Unfavorite
      await prisma.favoriteCollection.delete({
        where: { userId_collectionId: { userId, collectionId: id } }
      });
      res.json({ favorited: false });
    } else {
      // Favorite
      await prisma.favoriteCollection.create({
        data: { userId, collectionId: id }
      });
      res.json({ favorited: true });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

export default router;