/**
 * 🔐 AUTHENTICATION SERVICE
 * Handles operator authentication and login logic
 */

import container from '../config/container.js';
import { TokenManager } from '../utils/security.js';
import { operatorEventLogger } from './operator-event-logging.js';
import { OperatorRepository } from '../utils/operator-repository.js';
import logger from '../utils/logger.js';

class AuthService {
  /**
   * Authenticate operator with username and password
   * @param {string} username - Operator username
   * @param {string} password - Plain text password
   * @param {Object} requestInfo - Request metadata (ip, userAgent)
   * @returns {Promise<Object>} Authentication result with token and operator data
   */
  async login(username, password, requestInfo = {}) {
    const prisma = container.get('prisma');

    // 1. Find operator
    let operator = await this.findOperator(username);

    // 2. Auto-create admin if doesn't exist
    if (!operator && username === 'admin') {
      operator = await this.createAdminOperator();
      const token = TokenManager.generateToken({
        operatorId: operator.id,
        username: operator.username,
        name: operator.name
      });

      return {
        success: true,
        token,
        operator: this.formatOperatorResponse(operator),
        message: 'Admin account created and logged in',
        autoAssigned: null
      };
    }

    // 3. Verify operator exists and is active
    if (!operator || !operator.isActive) {
      return {
        success: false,
        message: 'Operatore non trovato o disattivato',
        statusCode: 401
      };
    }

    // 4. Verify password
    const isValidPassword = await TokenManager.verifyPassword(password, operator.passwordHash);

    if (!isValidPassword) {
      return {
        success: false,
        message: 'Credenziali non valide',
        statusCode: 401
      };
    }

    // 5. Update online status
    await prisma.operator.update({
      where: { id: operator.id },
      data: {
        isOnline: true,
        lastSeen: new Date()
      }
    });

    // 6. Log login event
    await operatorEventLogger.logLogin(
      operator.id,
      requestInfo.ip,
      requestInfo.userAgent
    );

    // 7. Generate JWT token
    const token = TokenManager.generateToken({
      operatorId: operator.id,
      username: operator.username,
      name: operator.name
    });

    // 8. Try auto-assign from queue
    const assignedChat = await this.tryAutoAssign(operator.id);

    return {
      success: true,
      token,
      operator: this.formatOperatorResponse(operator),
      message: 'Login successful',
      autoAssigned: assignedChat
    };
  }

  /**
   * Find operator by username
   * @private
   */
  async findOperator(username) {
    return await OperatorRepository.getByUsername(username);
  }

  /**
   * Create default admin operator
   * @private
   */
  async createAdminOperator() {
    const prisma = container.get('prisma');
    const hashedPassword = await TokenManager.hashPassword(
      process.env.ADMIN_PASSWORD || 'admin123'
    );

    return await prisma.operator.create({
      data: {
        username: 'admin',
        email: 'supporto@lucinedinatale.it',
        name: 'Lucy - Assistente Specializzato',
        displayName: 'Lucy',
        avatar: '👑',
        role: 'ADMIN',
        passwordHash: hashedPassword,
        isActive: true,
        isOnline: true
      },
      select: {
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
      }
    });
  }

  /**
   * Try to auto-assign chat from queue on login
   * @private
   */
  async tryAutoAssign(operatorId) {
    try {
      const { queueService } = await import('./queue-service.js');
      const assignmentResult = await queueService.assignNextInQueue(operatorId, []);

      if (assignmentResult.assigned) {
        logger.auth.autoAssign(operator.id, assignmentResult.sessionId);
        return {
          sessionId: assignmentResult.sessionId,
          waitTime: assignmentResult.waitTime
        };
      }

      return null;
    } catch (error) {
      logger.warn('AUTH', 'Failed to auto-assign from queue on login', { operatorId: operator.id, error: error.message });
      return null;
    }
  }

  /**
   * Format operator data for API response
   * @private
   */
  formatOperatorResponse(operator) {
    return {
      id: operator.id,
      username: operator.username,
      name: operator.name,
      displayName: operator.displayName || operator.name,
      avatar: operator.avatar || '👤',
      role: operator.role || 'OPERATOR',
      email: operator.email,
      isOnline: true,
      isActive: true
    };
  }

  /**
   * Logout operator (update online status)
   */
  async logout(operatorId) {
    const prisma = container.get('prisma');

    await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline: false,
        lastSeen: new Date(),
        availabilityStatus: 'OFFLINE'
      }
    });

    logger.auth.logout(operatorId);
    return { success: true };
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
