/**
 * 👥 OPERATOR REPOSITORY
 * Centralized operator data access to eliminate duplicate queries
 */

import container from '../config/container.js';

/**
 * Standard field selections for different use cases
 */
export const OPERATOR_FIELDS = {
  // Minimal fields for lists (dashboard, dropdowns)
  BASIC: {
    id: true,
    name: true,
    email: true,
    isOnline: true
  },

  // Full profile for management/admin views
  FULL: {
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

  // For authentication (includes passwordHash)
  AUTH: {
    id: true,
    username: true,
    email: true,
    name: true,
    displayName: true,
    avatar: true,
    role: true,
    passwordHash: true,
    isActive: true,
    isOnline: true,
    lastSeen: true,
    createdAt: true
  },

  // For availability checks (escalation, queue)
  AVAILABILITY: {
    id: true,
    name: true,
    isOnline: true,
    isActive: true,
    lastSeen: true
  },

  // For notifications (just enough info)
  NOTIFICATION: {
    id: true,
    name: true,
    email: true
  }
};

/**
 * OperatorRepository - Centralized operator queries
 */
export class OperatorRepository {
  /**
   * Get all active operators (basic info)
   */
  static async getActiveOperators() {
    const prisma = container.get('prisma');
    return await prisma.operator.findMany({
      where: { isActive: true },
      select: OPERATOR_FIELDS.BASIC,
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Get all operators (full profile) - Admin only
   */
  static async getAllOperators() {
    const prisma = container.get('prisma');
    return await prisma.operator.findMany({
      select: OPERATOR_FIELDS.FULL,
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get online & available operators
   * NOTE: No lastSeen check - operators control their own availability via toggle
   */
  static async getAvailableOperators() {
    const prisma = container.get('prisma');

    return await prisma.operator.findMany({
      where: {
        isOnline: true,
        isActive: true
      },
      select: OPERATOR_FIELDS.AVAILABILITY
    });
  }

  /**
   * Get operator by ID
   * @param {string} id - Operator ID
   * @param {Object} select - Optional custom field selection (defaults to FULL)
   */
  static async getById(id, select = OPERATOR_FIELDS.FULL) {
    const prisma = container.get('prisma');
    return await prisma.operator.findUnique({
      where: { id },
      select
    });
  }

  /**
   * Get operator by username (for login)
   */
  static async getByUsername(username) {
    const prisma = container.get('prisma');
    return await prisma.operator.findUnique({
      where: { username },
      select: OPERATOR_FIELDS.AUTH
    });
  }

  /**
   * Get operators for notifications (managers/admins)
   */
  static async getNotificationRecipients(roleFilter = null) {
    const prisma = container.get('prisma');
    const where = { isActive: true };

    if (roleFilter) {
      where.role = roleFilter;
    }

    return await prisma.operator.findMany({
      where,
      select: OPERATOR_FIELDS.NOTIFICATION
    });
  }

  /**
   * Check if operator exists and is active
   */
  static async existsAndActive(id) {
    const prisma = container.get('prisma');
    const operator = await prisma.operator.findUnique({
      where: { id },
      select: { id: true, isActive: true }
    });
    return operator && operator.isActive;
  }

  /**
   * Update operator status
   */
  static async updateStatus(id, status) {
    const prisma = container.get('prisma');
    return await prisma.operator.update({
      where: { id },
      data: {
        isOnline: status.isOnline !== undefined ? status.isOnline : undefined,
        lastSeen: new Date()
      }
    });
  }

  /**
   * @deprecated Auto-logout REMOVED - operators control their own status via toggle
   * lastSeen is now only for statistics, NOT for availability logic
   *
   * Keeping this function for backward compatibility but it does nothing
   */
  static async autoLogoutInactive() {
    // NO-OP: Operators manage their own online/offline status
    // If they want to be available, they toggle on
    // If they want to be unavailable, they toggle off
    // No automatic logout based on inactivity
    return 0;
  }
}

export default OperatorRepository;
