import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Chat stats
    const chatStats = await prisma.chatSession.groupBy({
      by: ['status'],
      _count: true
    });

    // Message stats
    const messageStats = await prisma.message.groupBy({
      by: ['sender'],
      _count: true,
      where: {
        timestamp: { gte: today }
      }
    });

    // Ticket stats
    const ticketStats = await prisma.ticket.groupBy({
      by: ['status'],
      _count: true
    });

    // Popular questions
    const popularQuestions = await prisma.$queryRaw`
      SELECT message, COUNT(*) as count
      FROM "Message"
      WHERE sender = 'USER'
        AND timestamp >= ${thisWeek}
      GROUP BY message
      ORDER BY count DESC
      LIMIT 10
    `;

    // Average response time
    const avgResponseTime = await prisma.analytics.aggregate({
      where: {
        eventType: 'chat_message',
        timestamp: { gte: today }
      },
      _avg: {
        responseTime: true
      }
    });

    // Operator performance
    const operatorStats = await prisma.operatorChat.groupBy({
      by: ['operatorId'],
      _count: true,
      _avg: {
        rating: true
      }
    });

    res.json({
      summary: {
        totalChats: chatStats.reduce((sum, s) => sum + s._count, 0),
        activeChats: chatStats.find(s => s.status === 'ACTIVE')?._count || 0,
        todayMessages: messageStats.reduce((sum, s) => sum + s._count, 0),
        openTickets: ticketStats.find(s => s.status === 'OPEN')?._count || 0,
        avgResponseTime: avgResponseTime._avg.responseTime || 0
      },
      chatStats,
      messageStats,
      ticketStats,
      popularQuestions,
      operatorStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get hourly stats
router.get('/hourly', async (req, res) => {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const hourlyStats = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) as messages,
        AVG(CASE WHEN sender = 'BOT' THEN 1 ELSE 0 END) as bot_ratio
      FROM "Message"
      WHERE timestamp >= ${last24Hours}
      GROUP BY hour
      ORDER BY hour DESC
    `;

    res.json({
      hourlyStats,
      period: '24h',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hourly stats' });
  }
});

// Get conversion stats
router.get('/conversions', async (req, res) => {
  try {
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Sessions that led to ticket creation
    const ticketConversions = await prisma.ticket.count({
      where: {
        createdAt: { gte: thisMonth }
      }
    });

    // Sessions that clicked on buy buttons
    const buyClicks = await prisma.analytics.count({
      where: {
        eventType: 'action_clicked',
        eventData: {
          path: ['action'],
          equals: 'biglietti_acquisto'
        },
        timestamp: { gte: thisMonth }
      }
    });

    // Total sessions this month
    const totalSessions = await prisma.chatSession.count({
      where: {
        startedAt: { gte: thisMonth }
      }
    });

    res.json({
      totalSessions,
      ticketConversions,
      ticketRate: totalSessions > 0 ? (ticketConversions / totalSessions * 100).toFixed(2) : 0,
      buyClicks,
      clickRate: totalSessions > 0 ? (buyClicks / totalSessions * 100).toFixed(2) : 0,
      period: 'current_month',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversion stats' });
  }
});

// Log custom event
router.post('/event', async (req, res) => {
  try {
    const { eventType, sessionId, eventData } = req.body;

    const event = await prisma.analytics.create({
      data: {
        eventType,
        sessionId,
        eventData
      }
    });

    res.json({ success: true, eventId: event.id });

  } catch (error) {
    res.status(500).json({ error: 'Failed to log event' });
  }
});

export default router;