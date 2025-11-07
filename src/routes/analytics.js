import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get heatmap data for video
router.get('/:videoId/heatmap', async (req, res) => {
  try {
    const { videoId } = req.params;
    const bucketSize = 5; // 5-second buckets

    // Get video duration
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { durationSeconds: true }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Get all play events for this video
    const events = await prisma.videoEvent.findMany({
      where: {
        videoId,
        eventType: { in: ['PLAY', 'SEEK', 'TIMEUPDATE'] }
      },
      select: { positionSeconds: true, eventType: true }
    });

    // Create buckets
    const bucketCount = Math.ceil(video.durationSeconds / bucketSize);
    const buckets = Array(bucketCount).fill(0);

    // Count events in each bucket
    events.forEach(event => {
      const bucketIndex = Math.floor(event.positionSeconds / bucketSize);
      if (bucketIndex < bucketCount) {
        buckets[bucketIndex]++;
      }
    });

    // Find most repeated segments
    const maxCount = Math.max(...buckets);
    const mostRepeatedBuckets = buckets
      .map((count, index) => ({
        start: index * bucketSize,
        end: (index + 1) * bucketSize,
        count
      }))
      .filter(bucket => bucket.count === maxCount)
      .sort((a, b) => a.start - b.start);

    res.json({
      videoId,
      duration: video.durationSeconds,
      bucketSize,
      heatmap: buckets,
      mostRepeated: mostRepeatedBuckets
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate heatmap' });
  }
});

export default router;