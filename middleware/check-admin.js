/**
 * 👑 ADMIN CHECK MIDDLEWARE
 * Verifica che l'utente sia un amministratore
 */

import container from '../config/container.js';

export async function checkAdmin(req, res, next) {
  try {
    // req.operator is set by authenticateToken middleware
    if (!req.operator) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const prisma = container.get('prisma');
    const operator = await prisma.operator.findUnique({
      where: { id: req.operator.id },
      select: { role: true, username: true }
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    if (operator.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo gli amministratori possono accedere a questa funzione'
      });
    }

    // Operator is admin, proceed
    console.log(`✅ Admin access granted for ${operator.username}`);
    next();
  } catch (error) {
    console.error('❌ Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export default checkAdmin;
