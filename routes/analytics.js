import express from 'express';
import container from '../config/container.js';
import { StatusCodes, ErrorCodes } from '../utils/api-response.js';

const router = express.Router();

// Helper to get prisma (lazy load)
const getPrisma = () => container.get('prisma');
// const prisma = container.get('prisma');

// Simple test endpoint
router.get('/test', (req, res) => {
  res.success(
    { status: 'ok' }, 
    'Analytics endpoint working'
  );
});

// Simplified dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Fetching simplified dashboard analytics...');

    // Basic counts only
    const totalChats = await getPrisma().chatSession.count();
    const activeChats = await getPrisma().chatSession.count({ where: { status: 'ACTIVE' } });
    const endedChats = await getPrisma().chatSession.count({ where: { status: 'ENDED' } });
    const operatorChats = await getPrisma().chatSession.count({ where: { status: 'WITH_OPERATOR' } });
    
    const totalMessages = await getPrisma().message.count();
    const openTickets = await getPrisma().ticket.count({ where: { status: 'OPEN' } });
    
    // Recent activity - basic version
    const recentActivity = await getPrisma().message.findMany({
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

    res.success({
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
      ]
    }, 'Dashboard analytics loaded successfully');

  } catch (error) {
    console.error('❌ Simplified analytics error:', error);
    res.error(
      'Failed to fetch analytics',
      ErrorCodes.INTERNAL_ERROR,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
});

export default router;