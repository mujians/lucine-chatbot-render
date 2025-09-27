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

    console.log('📊 Fetching dashboard analytics...');

    // Chat stats
    const chatStats = await prisma.chatSession.groupBy({
      by: ['status'],
      _count: true
    });

    // Today's chat sessions
    const todayChats = await prisma.chatSession.count({
      where: {
        startedAt: { gte: today }
      }
    });

    // Message stats for today
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

    // Recent activity - last 10 activities
    const recentActivity = await prisma.message.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        session: true
      },
      where: {
        sender: { in: ['USER', 'OPERATOR'] }
      }
    });

    // Chat sessions with operator escalation
    const escalatedChats = await prisma.chatSession.count({
      where: {
        status: 'WITH_OPERATOR'
      }
    });

    // Average session duration calculation
    const completedSessions = await prisma.chatSession.findMany({
      where: {
        status: 'ENDED',
        endedAt: { not: null },
        startedAt: { gte: thisWeek }
      },
      select: {
        startedAt: true,
        endedAt: true
      }
    });

    const avgSessionDuration = completedSessions.length > 0 
      ? completedSessions.reduce((sum, session) => {
          const duration = new Date(session.endedAt) - new Date(session.startedAt);
          return sum + duration;
        }, 0) / completedSessions.length / 1000 / 60 // Convert to minutes
      : 0;

    // Calculate satisfaction rating from operator chats
    const satisfactionData = await prisma.operatorChat.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
      where: {
        rating: { not: null }
      }
    });

    // Most active hours analysis
    const activeHours = await prisma.$queryRaw`
      SELECT 
        EXTRACT(hour FROM timestamp) as hour,
        COUNT(*) as message_count
      FROM "Message"
      WHERE timestamp >= ${thisWeek}
      GROUP BY hour
      ORDER BY message_count DESC
      LIMIT 5
    `;

    res.json({
      summary: {
        totalChats: chatStats.reduce((sum, s) => sum + s._count, 0),
        todayChats,
        activeChats: chatStats.find(s => s.status === 'ACTIVE')?._count || 0,
        escalatedChats,
        openTickets: ticketStats.find(s => s.status === 'OPEN')?._count || 0,
        avgSessionDuration: Math.round(avgSessionDuration * 10) / 10, // Round to 1 decimal
        satisfaction: satisfactionData._avg.rating ? Math.round(satisfactionData._avg.rating * 10) / 10 : null,
        totalRatings: satisfactionData._count.rating || 0
      },
      recentActivity: recentActivity.map(msg => ({
        id: msg.id,
        message: msg.message.substring(0, 50) + (msg.message.length > 50 ? '...' : ''),
        sender: msg.sender,
        timestamp: msg.timestamp,
        sessionId: msg.session.sessionId
      })),
      chatStats: chatStats.map(stat => ({
        status: stat.status,
        count: stat._count,
        label: stat.status === 'ACTIVE' ? 'Attive' : 
               stat.status === 'WITH_OPERATOR' ? 'Con Operatore' : 
               stat.status === 'ENDED' ? 'Terminate' : stat.status
      })),
      messageStats: messageStats.map(stat => ({
        sender: stat.sender,
        count: stat._count,
        label: stat.sender === 'USER' ? 'Utenti' : 
               stat.sender === 'BOT' ? 'Bot' : 
               stat.sender === 'OPERATOR' ? 'Operatori' : stat.sender
      })),
      ticketStats: ticketStats.map(stat => ({
        status: stat.status,
        count: stat._count,
        label: stat.status === 'OPEN' ? 'Aperti' : 
               stat.status === 'CLOSED' ? 'Chiusi' : stat.status
      })),
      activeHours: activeHours.map(hour => ({
        hour: parseInt(hour.hour),
        messageCount: parseInt(hour.message_count),
        label: `${hour.hour}:00`
      })),
      timestamp: new Date().toISOString()
    });

    console.log('✅ Dashboard analytics sent successfully');

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      timestamp: new Date().toISOString()
    });
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