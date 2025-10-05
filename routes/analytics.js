import express from 'express';
import container from '../config/container.js';
import { StatusCodes, ErrorCodes } from '../utils/api-response.js';

const router = express.Router();

// Helper to get database client (lazy load)
const getDatabase = () => container.get('prisma');
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
    const totalChats = await getDatabase().chatSession.count();
    const activeChats = await getDatabase().chatSession.count({ where: { status: 'ACTIVE' } });
    const endedChats = await getDatabase().chatSession.count({ where: { status: 'ENDED' } });
    const operatorChats = await getDatabase().chatSession.count({ where: { status: 'WITH_OPERATOR' } });
    
    const totalMessages = await getDatabase().message.count();
    const openTickets = await getDatabase().ticket.count({ where: { status: 'OPEN' } });

    // Operator statistics
    const totalOperators = await getDatabase().operator.count({ where: { isActive: true } });
    const onlineOperators = await getDatabase().operator.count({
      where: { isActive: true, isOnline: true }
    });

    // Chats per operator (active and completed)
    const operatorStats = await getDatabase().operatorChat.groupBy({
      by: ['operatorId'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    // Get operator details with chat counts
    const operatorDetails = await Promise.all(
      operatorStats.slice(0, 5).map(async (stat) => {
        const operator = await getDatabase().operator.findUnique({
          where: { id: stat.operatorId },
          select: {
            id: true,
            name: true,
            isOnline: true,
            email: true
          }
        });

        const activeChatsCount = await getDatabase().operatorChat.count({
          where: {
            operatorId: stat.operatorId,
            endedAt: null
          }
        });

        return {
          ...operator,
          totalChats: stat._count.id,
          activeChats: activeChatsCount
        };
      })
    );

    // Recent activity - basic version
    const recentActivity = await getDatabase().message.findMany({
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
      operators: {
        total: totalOperators,
        online: onlineOperators,
        offline: totalOperators - onlineOperators,
        topPerformers: operatorDetails
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