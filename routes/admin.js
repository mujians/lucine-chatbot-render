import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

// Simple auth middleware (TODO: implement proper auth)
const authMiddleware = (req, res, next) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Database stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = {
      sessions: await prisma.chatSession.count(),
      messages: await prisma.message.count(),
      tickets: await prisma.ticket.count(),
      operators: await prisma.operator.count(),
      analytics: await prisma.analytics.count(),
      knowledgeItems: await prisma.knowledgeItem.count()
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Clear old data
router.post('/cleanup', authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Delete old analytics
    const deletedAnalytics = await prisma.analytics.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    });

    // Delete old ended sessions
    const deletedSessions = await prisma.chatSession.deleteMany({
      where: {
        status: 'ENDED',
        lastActivity: { lt: cutoffDate }
      }
    });

    res.json({
      success: true,
      deleted: {
        analytics: deletedAnalytics.count,
        sessions: deletedSessions.count
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// Export data
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const messages = await prisma.message.findMany({
      where: {
        timestamp: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined
        }
      },
      include: {
        session: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    res.json({
      exportDate: new Date().toISOString(),
      period: { startDate, endDate },
      count: messages.length,
      data: messages
    });

  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Update knowledge base
router.post('/knowledge', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;

    // Clear existing items
    await prisma.knowledgeItem.deleteMany();

    // Insert new items
    const created = await prisma.knowledgeItem.createMany({
      data: items.map(item => ({
        category: item.category,
        question: item.question,
        answer: item.answer,
        keywords: item.keywords || []
      }))
    });

    res.json({
      success: true,
      created: created.count
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update knowledge base' });
  }
});

// Create operator account
router.post('/operator', authMiddleware, async (req, res) => {
  try {
    const { username, email, name, password } = req.body;

    // TODO: Hash password properly
    const operator = await prisma.operator.create({
      data: {
        username,
        email,
        name,
        passwordHash: password // TODO: use bcrypt
      }
    });

    res.json({
      success: true,
      operator: {
        id: operator.id,
        username: operator.username,
        name: operator.name
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to create operator' });
  }
});

export default router;