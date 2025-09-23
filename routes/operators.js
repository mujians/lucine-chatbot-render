import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

// Get operator status
router.get('/status', async (req, res) => {
  try {
    const operators = await prisma.operator.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isOnline: true,
        lastSeen: true
      }
    });

    const onlineCount = operators.filter(op => op.isOnline).length;

    res.json({
      online_operators: onlineCount,
      operators,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch operator status' });
  }
});

// Operator login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // TODO: Implement proper authentication
    const operator = await prisma.operator.findUnique({
      where: { username }
    });

    if (!operator) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update online status
    await prisma.operator.update({
      where: { id: operator.id },
      data: { 
        isOnline: true,
        lastSeen: new Date()
      }
    });

    res.json({
      success: true,
      operator: {
        id: operator.id,
        name: operator.name,
        email: operator.email
      },
      token: 'TODO-implement-JWT'
    });

  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get pending chats
router.get('/pending-chats', async (req, res) => {
  try {
    const pendingChats = await prisma.chatSession.findMany({
      where: {
        status: 'ACTIVE',
        operatorChats: {
          none: {}
        }
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 5
        }
      }
    });

    res.json({
      pending: pendingChats.map(chat => ({
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message
      })),
      count: pendingChats.length
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending chats' });
  }
});

// Take chat
router.post('/take-chat', async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    // Check if chat already taken
    const existing = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        endedAt: null
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Chat already taken' });
    }

    // Create operator chat
    const operatorChat = await prisma.operatorChat.create({
      data: {
        sessionId,
        operatorId
      }
    });

    // Update session status
    await prisma.chatSession.update({
      where: { sessionId },
      data: { status: 'WITH_OPERATOR' }
    });

    // Get operator info
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { name: true }
    });

    // Add system message
    await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: `Operatore ${operator.name} si è unito alla chat`
      }
    });

    res.json({
      success: true,
      chatId: operatorChat.id,
      operator: operator.name
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to take chat' });
  }
});

// Send operator message
router.post('/send-message', async (req, res) => {
  try {
    const { sessionId, operatorId, message } = req.body;

    // Verify operator owns the chat
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Not authorized for this chat' });
    }

    // Save message
    const savedMessage = await prisma.message.create({
      data: {
        sessionId,
        sender: 'OPERATOR',
        message,
        metadata: { operatorId }
      }
    });

    res.json({
      success: true,
      messageId: savedMessage.id,
      timestamp: savedMessage.timestamp
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// End chat
router.post('/end-chat', async (req, res) => {
  try {
    const { sessionId, operatorId, rating, notes } = req.body;

    // End operator chat
    const operatorChat = await prisma.operatorChat.updateMany({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      },
      data: {
        endedAt: new Date(),
        rating,
        notes
      }
    });

    // Update session status
    await prisma.chatSession.update({
      where: { sessionId },
      data: { status: 'ENDED' }
    });

    // Add system message
    await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: 'Chat terminata'
      }
    });

    res.json({
      success: true,
      message: 'Chat ended successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to end chat' });
  }
});

// Operator logout
router.post('/logout', async (req, res) => {
  try {
    const { operatorId } = req.body;

    await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline: false,
        lastSeen: new Date()
      }
    });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;