import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

// Create ticket
router.post('/', async (req, res) => {
  try {
    const { 
      sessionId, 
      subject, 
      description, 
      userEmail, 
      userPhone, 
      contactMethod 
    } = req.body;

    const ticket = await prisma.ticket.create({
      data: {
        sessionId,
        subject: subject || 'Richiesta supporto',
        description,
        userEmail,
        userPhone,
        contactMethod: contactMethod || 'EMAIL',
        priority: 'MEDIUM'
      }
    });

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: 'ticket_created',
        sessionId,
        eventData: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          contactMethod
        }
      }
    });

    res.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      message: `Ticket #${ticket.ticketNumber} creato. Ti contatteremo presto!`
    });

  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Get ticket status
router.get('/:ticketNumber', async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: req.params.ticketNumber },
      include: {
        notes: {
          where: { isPublic: true },
          orderBy: { createdAt: 'desc' }
        },
        assignedTo: {
          select: { name: true }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      assignedTo: ticket.assignedTo?.name,
      notes: ticket.notes
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// List all tickets (admin)
router.get('/', async (req, res) => {
  try {
    // TODO: Add authentication check
    
    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: { name: true }
        }
      }
    });

    res.json({
      tickets,
      count: tickets.length,
      stats: {
        open: tickets.filter(t => t.status === 'OPEN').length,
        inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
        resolved: tickets.filter(t => t.status === 'RESOLVED').length
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Update ticket (admin)
router.put('/:ticketId', async (req, res) => {
  try {
    // TODO: Add authentication check
    
    const { status, priority, operatorId, note } = req.body;
    
    const ticket = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status,
        priority,
        operatorId,
        resolvedAt: status === 'RESOLVED' ? new Date() : undefined
      }
    });

    if (note) {
      await prisma.ticketNote.create({
        data: {
          ticketId: ticket.id,
          note,
          createdBy: operatorId,
          isPublic: false
        }
      });
    }

    res.json({ 
      success: true, 
      ticket 
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

export default router;