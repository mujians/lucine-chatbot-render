/**
 * 👥 USER MANAGEMENT ROUTES
 * Gestione utenti operatori (solo ADMIN)
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import container from '../config/container.js';
import { authenticateToken } from '../middleware/security.js';
import checkAdmin from '../middleware/check-admin.js';

const router = express.Router();

// Helper to get prisma
const getPrisma = () => container.get('prisma');

/**
 * GET /api/users - Lista tutti gli operatori (ADMIN only)
 */
router.get('/', authenticateToken, checkAdmin, async (req, res) => {
  try {
    const operators = await getPrisma().operator.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        displayName: true,
        avatar: true,
        specialization: true,
        role: true,
        isActive: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(operators);
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/users/me - Get current operator info
 * IMPORTANT: This must come BEFORE /:id route
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const operator = await getPrisma().operator.findUnique({
      where: { id: req.operatorId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        displayName: true,
        avatar: true,
        specialization: true,
        role: true,
        isActive: true,
        isOnline: true
      }
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    res.json({ success: true, user: operator });
  } catch (error) {
    console.error('❌ Error fetching current user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * GET /api/users/:id - Get single operator (ADMIN only)
 */
router.get('/:id', authenticateToken, checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const operator = await getPrisma().operator.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        displayName: true,
        avatar: true,
        specialization: true,
        role: true,
        isActive: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true
      }
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operatore non trovato' });
    }

    res.json(operator);
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * POST /api/users - Crea nuovo operatore (ADMIN only)
 */
router.post('/', authenticateToken, checkAdmin, async (req, res) => {
  try {
    const { username, email, name, password, displayName, avatar, specialization } = req.body;

    // Validation
    if (!username || !email || !name || !password) {
      return res.status(400).json({
        error: 'Campi obbligatori: username, email, name, password'
      });
    }

    // Check if username or email already exists
    const existing = await getPrisma().operator.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({
        error: existing.username === username ?
          'Username già in uso' :
          'Email già in uso'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create operator
    const operator = await getPrisma().operator.create({
      data: {
        username,
        email,
        name,
        displayName: displayName || name,
        avatar: avatar || '👤',
        specialization: specialization || null,
        passwordHash,
        role: 'OPERATOR', // New users are always OPERATOR
        isActive: true,
        isOnline: false
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        displayName: true,
        avatar: true,
        role: true,
        createdAt: true
      }
    });

    console.log(`✅ New operator created: ${operator.username}`);

    res.json({
      success: true,
      message: 'Operatore creato con successo',
      user: operator
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id - Aggiorna operatore (ADMIN only)
 */
router.put('/:id', authenticateToken, checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayName, avatar, specialization, isActive, password } = req.body;

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (specialization !== undefined) updateData.specialization = specialization;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update password if provided
    if (password && password.length > 0) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const operator = await getPrisma().operator.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        displayName: true,
        avatar: true,
        specialization: true,
        role: true,
        isActive: true,
        isOnline: true
      }
    });

    console.log(`✅ Operator updated: ${operator.username}`);

    res.json({
      success: true,
      message: 'Operatore aggiornato con successo',
      user: operator
    });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id - Disattiva operatore (ADMIN only)
 * Non elimina fisicamente, solo disattiva
 */
router.delete('/:id', authenticateToken, checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if trying to delete admin
    const operator = await getPrisma().operator.findUnique({
      where: { id },
      select: { role: true, username: true }
    });

    if (operator.role === 'ADMIN') {
      return res.status(400).json({
        error: 'Impossibile disattivare l\'amministratore'
      });
    }

    // Deactivate instead of delete
    await getPrisma().operator.update({
      where: { id },
      data: {
        isActive: false,
        isOnline: false
      }
    });

    console.log(`✅ Operator deactivated: ${operator.username}`);

    res.json({
      success: true,
      message: 'Operatore disattivato con successo'
    });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
