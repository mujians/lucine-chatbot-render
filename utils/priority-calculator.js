/**
 * 🎯 PRIORITY CALCULATOR
 * Centralized priority calculation based on wait time
 */

/**
 * Priority thresholds in minutes
 */
const PRIORITY_THRESHOLDS = {
  HIGH: 15,   // > 15 minutes = HIGH priority
  MEDIUM: 5   // > 5 minutes = MEDIUM priority
  // <= 5 minutes = LOW priority
};

/**
 * Calculate priority based on wait time
 * @param {Date|number} startTime - Session creation time (Date object or timestamp)
 * @returns {string} Priority level: 'LOW' | 'MEDIUM' | 'HIGH'
 */
export function calculatePriority(startTime) {
  const sessionAge = Date.now() - (startTime instanceof Date ? startTime.getTime() : new Date(startTime).getTime());
  const minutesWaiting = Math.floor(sessionAge / 60000);

  if (minutesWaiting > PRIORITY_THRESHOLDS.HIGH) {
    return 'HIGH';
  } else if (minutesWaiting > PRIORITY_THRESHOLDS.MEDIUM) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Get minutes waiting for a session
 * @param {Date|number} startTime - Session creation time
 * @returns {number} Minutes waiting
 */
export function getMinutesWaiting(startTime) {
  const sessionAge = Date.now() - (startTime instanceof Date ? startTime.getTime() : new Date(startTime).getTime());
  return Math.floor(sessionAge / 60000);
}

/**
 * Get priority thresholds (for config/display purposes)
 * @returns {Object} Priority thresholds
 */
export function getPriorityThresholds() {
  return { ...PRIORITY_THRESHOLDS };
}
