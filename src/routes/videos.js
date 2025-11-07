import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
//import { redisClient } from '../server.js';

const router = express.Router();

// Get all videos
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tags, collection } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where = { isPublished: true };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } }
      ];
    }

    if (tags) {
      const tagArray = tags.split(',');
      where.tags = { hasSome: tagArray };
    }

    if (collection) {
      where.collections = {
        some: {
          collectionId: collection
        }
      };
    }

    const videos = await prisma.video.findMany({
      where,
      include: {
        owner: {
          select: { id: true, displayName: true, avatarUrl: true }
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

    const total = await prisma.video.count({ where });

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

// Get single video
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Increment view count in Redis
   // const viewKey = `video:${id}:views`;
  //  await redisClient.incr(viewKey);
  
  await prisma.video.update({
  where: { id },
  data: { viewsCount: { increment: 1 } }
});

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        collections: {
          include: {
            collection: true
          }
        },
        comments: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true }
            },
            replies: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true }
                }
              }
            }
          },
          where: { parentCommentId: null },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ video });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// Like/unlike video
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingLike = await prisma.like.findUnique({
      where: { userId_videoId: { userId, videoId: id } }
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { userId_videoId: { userId, videoId: id } }
      });
      await prisma.video.update({
        where: { id },
        data: { likesCount: { decrement: 1 } }
      });
      res.json({ liked: false });
    } else {
      // Like
      await prisma.like.create({
        data: { userId, videoId: id }
      });
      await prisma.video.update({
        where: { id },
        data: { likesCount: { increment: 1 } }
      });
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { body, parentCommentId } = req.body;
    const userId = req.user.id;

    if (!body) {
      return res.status(400).json({ error: 'Comment body is required' });
    }

    const comment = await prisma.comment.create({
      data: {
        body,
        videoId: id,
        userId,
        parentCommentId: parentCommentId || null
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Create notification if it's a reply
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentCommentId },
        include: { user: true }
      });

      if (parentComment && parentComment.userId !== userId) {
        await prisma.notification.create({
          data: {
            userId: parentComment.userId,
            type: 'REPLY',
            payload: {
              commentId: comment.id,
              videoId: id,
              videoTitle: 'Video', // You might want to fetch the actual title
              repliedBy: req.user.displayName
            }
          }
        });
      }
    }

    res.status(201).json({ comment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Record video event
router.post('/:id/events', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { eventType, positionSeconds, sessionId } = req.body;
    const userId = req.user.id;

    await prisma.videoEvent.create({
      data: {
        videoId: id,
        userId,
        eventType,
        positionSeconds: parseFloat(positionSeconds),
        sessionId
      }
    });

    // Update watch history
    if (eventType === 'TIMEUPDATE' || eventType === 'PAUSE') {
      await prisma.watchHistory.upsert({
        where: { userId_videoId: { userId, videoId: id } },
        update: { lastPosition: positionSeconds, watchedAt: new Date() },
        create: {
          userId,
          videoId: id,
          lastPosition: positionSeconds
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

export default router;