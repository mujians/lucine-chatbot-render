import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Analytics endpoint working',
    timestamp: new Date().toISOString() 
  });
});

// Simplified dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Fetching simplified dashboard analytics...');

    // Basic counts only
    const totalChats = await prisma.chatSession.count();
    const activeChats = await prisma.chatSession.count({ where: { status: 'ACTIVE' } });
    const endedChats = await prisma.chatSession.count({ where: { status: 'ENDED' } });
    const operatorChats = await prisma.chatSession.count({ where: { status: 'WITH_OPERATOR' } });
    
    const totalMessages = await prisma.message.count();
    const openTickets = await prisma.ticket.count({ where: { status: 'OPEN' } });
    
    // Recent activity - basic version
    const recentActivity = await prisma.message.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      include: {
        session: {
          select: {
            sessionId: true
          }
        }
      },
      where: {
        sender: { in: ['USER', 'OPERATOR'] }
      }
    });

    console.log('✅ Simplified analytics queries successful');

    res.json({
      summary: {
        totalChats,
        activeChats,
        endedChats,
        operatorChats,
        openTickets,
        totalMessages,
        avgSessionDuration: 0, // Placeholder
        satisfaction: null, // Placeholder
        totalRatings: 0
      },
      recentActivity: recentActivity.map(msg => ({
        id: msg.id,
        message: msg.message.substring(0, 50) + (msg.message.length > 50 ? '...' : ''),
        sender: msg.sender,
        timestamp: msg.timestamp,
        sessionId: msg.session.sessionId
      })),
      chatStats: [
        { status: 'ACTIVE', count: activeChats, label: 'Attive' },
        { status: 'ENDED', count: endedChats, label: 'Terminate' },
        { status: 'WITH_OPERATOR', count: operatorChats, label: 'Con Operatore' }
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Simplified analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;