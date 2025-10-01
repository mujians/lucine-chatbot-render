/**
 * 🎯 DEPENDENCY INJECTION CONTAINER
 * Risolve dipendenze circolari tra server.js e routes
 */

class Container {
  constructor() {
    this.dependencies = new Map();
  }

  /**
   * Registra una dipendenza
   */
  register(name, dependency) {
    this.dependencies.set(name, dependency);
  }

  /**
   * Ottieni una dipendenza
   */
  get(name) {
    if (!this.dependencies.has(name)) {
      throw new Error(`Dependency "${name}" not found in container`);
    }
    return this.dependencies.get(name);
  }

  /**
   * Controlla se una dipendenza esiste
   */
  has(name) {
    return this.dependencies.has(name);
  }

  /**
   * Rimuovi una dipendenza
   */
  remove(name) {
    this.dependencies.delete(name);
  }

  /**
   * Clear all dependencies
   */
  clear() {
    this.dependencies.clear();
  }
}

// Singleton instance
const container = new Container();

export default container;
