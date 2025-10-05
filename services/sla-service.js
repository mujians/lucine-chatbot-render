/**
 * ⏰ SLA Monitoring Service - Lucine di Natale
 * Gestisce Service Level Agreements e escalation automatica
 *
 * Architecture: Orchestrates 5 specialized modules
 * - SLALifecycleManager: Create, mark first response, mark resolved
 * - SLAMonitor: Continuous monitoring and warnings
 * - SLAViolationsHandler: Violation handling and management notifications
 * - SLAEscalationManager: Escalation logic and ticket creation
 * - SLAMetrics: Metrics, analytics, and reporting
 */

import logger from '../utils/logger.js';
import { SLALifecycleManager } from './sla/sla-lifecycle.js';
import { SLAMonitor } from './sla/sla-monitor.js';
import { SLAViolationsHandler } from './sla/sla-violations.js';
import { SLAEscalationManager } from './sla/sla-escalation.js';
import { SLAMetrics } from './sla/sla-metrics.js';

class SLAService {
  constructor() {
    this.slaThresholds = {
      RESPONSE_TIME: {
        HIGH: 5 * 60 * 1000,     // 5 minuti per HIGH priority
        MEDIUM: 15 * 60 * 1000,  // 15 minuti per MEDIUM priority
        LOW: 30 * 60 * 1000      // 30 minuti per LOW priority
      },
      RESOLUTION_TIME: {
        HIGH: 2 * 60 * 60 * 1000,  // 2 ore per HIGH priority
        MEDIUM: 8 * 60 * 60 * 1000, // 8 ore per MEDIUM priority
        LOW: 24 * 60 * 60 * 1000   // 24 ore per LOW priority
      },
      WARNING_PERCENTAGE: 0.8 // Avvisa all'80% del tempo SLA
    };

    this.prisma = null; // Assigned during init

    // Module instances (initialized in init())
    this.lifecycleManager = null;
    this.monitor = null;
    this.violationsHandler = null;
    this.escalationManager = null;
    this.metrics = null;
  }

  async init(prisma) {
    this.prisma = prisma;

    // Initialize modules with shared dependencies
    this.lifecycleManager = new SLALifecycleManager(prisma, this.slaThresholds);
    this.monitor = new SLAMonitor(prisma, this.slaThresholds);
    this.violationsHandler = new SLAViolationsHandler(prisma);
    this.escalationManager = new SLAEscalationManager(prisma);
    this.metrics = new SLAMetrics(prisma);

    // Carica SLA esistenti dal database
    await this.lifecycleManager.loadExistingSLAs();

    // Avvia monitoring SLA
    this.monitor.startSLAMonitoring();

    logger.info('SLA', 'SLA Service initialized', {
      modules: ['SLALifecycleManager', 'SLAMonitor', 'SLAViolationsHandler', 'SLAEscalationManager', 'SLAMetrics']
    });
  }

  /**
   * 📊 Crea nuovo SLA per sessione/ticket
   */
  async createSLA(entityId, entityType, priority = 'MEDIUM', category = 'GENERAL') {
    return await this.lifecycleManager.createSLA(
      entityId,
      entityType,
      priority,
      category,
      this.scheduleSLACheck.bind(this),
      this.recordSLAEvent.bind(this)
    );
  }

  /**
   * ✅ Marca SLA come completato (first response)
   */
  async markFirstResponse(entityId, entityType, operatorId) {
    return await this.lifecycleManager.markFirstResponse(
      entityId,
      entityType,
      operatorId,
      this.handleResponseSLAViolation.bind(this),
      this.recordSLAEvent.bind(this)
    );
  }

  /**
   * 🏁 Marca SLA come risolto
   */
  async markResolved(entityId, entityType, operatorId, resolutionType = 'RESOLVED') {
    return await this.lifecycleManager.markResolved(
      entityId,
      entityType,
      operatorId,
      resolutionType,
      this.handleResolutionSLAViolation.bind(this),
      this.recordSLAEvent.bind(this)
    );
  }

  /**
   * ⏰ Check tutti gli SLA attivi
   */
  async checkAllSLAs() {
    return await this.monitor.checkAllSLAs(
      this.handleResponseSLAViolation.bind(this),
      this.handleResolutionSLAViolation.bind(this)
    );
  }

  /**
   * ⚠️ Invia warning SLA
   */
  async sendSLAWarning(sla) {
    return await this.monitor.sendSLAWarning(sla);
  }

  /**
   * 🚨 Gestisce violazione SLA response time
   */
  async handleResponseSLAViolation(sla, operatorId = null) {
    return await this.violationsHandler.handleResponseSLAViolation(
      sla,
      operatorId,
      this.escalateEntity.bind(this),
      this.notifyManagement.bind(this),
      this.recordSLAEvent.bind(this)
    );
  }

  /**
   * 🔥 Gestisce violazione SLA resolution time
   */
  async handleResolutionSLAViolation(sla, operatorId = null) {
    return await this.violationsHandler.handleResolutionSLAViolation(
      sla,
      operatorId,
      this.escalateEntity.bind(this),
      this.notifyManagement.bind(this),
      this.createEscalationTicket.bind(this)
    );
  }

  /**
   * 📞 Notifica management per violazioni
   */
  async notifyManagement(violationType, sla, minutesLate) {
    return await this.violationsHandler.notifyManagement(violationType, sla, minutesLate);
  }

  /**
   * 📈 Escalation automatica
   */
  async escalateEntity(entityId, entityType, reason, metadata) {
    return await this.escalationManager.escalateEntity(
      entityId,
      entityType,
      reason,
      metadata,
      this.recordSLAEvent.bind(this)
    );
  }

  /**
   * 🎫 Crea ticket di escalation
   */
  async createEscalationTicket(sla, minutesLate) {
    return await this.escalationManager.createEscalationTicket(sla, minutesLate);
  }

  /**
   * 📊 Ottieni metriche SLA
   */
  async getSLAMetrics(days = 7) {
    return await this.metrics.getSLAMetrics(days);
  }

  /**
   * 📊 Record SLA event
   */
  async recordSLAEvent(eventType, slaId, eventData) {
    return await this.metrics.recordSLAEvent(eventType, slaId, eventData);
  }

  /**
   * 📅 Schedule SLA check
   */
  scheduleSLACheck(slaId) {
    return this.monitor.scheduleSLACheck(slaId, this.handleResponseSLAViolation.bind(this));
  }

  /**
   * 🔄 Cleanup method for graceful shutdown
   */
  async cleanup() {
    if (this.monitor) {
      this.monitor.stop();
    }
    logger.info('SLA', 'SLA Service cleaned up');
  }
}

// Export singleton instance
export const slaService = new SLAService();
