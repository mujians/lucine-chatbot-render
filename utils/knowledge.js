/**
 * 📚 KNOWLEDGE BASE LOADER with CACHING
 * Carica la knowledge base dal JSON con caching in memoria
 */

import { readFileSync, watch } from 'fs';
import { join } from 'path';
import { PATHS } from '../config/constants.js';

// In-memory cache
let knowledgeBaseCache = null;
let lastLoadTime = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti

/**
 * Carica knowledge base con caching
 */
export async function loadKnowledgeBase(forceReload = false) {
  try {
    // Check if cache is valid
    if (!forceReload && knowledgeBaseCache && lastLoadTime) {
      const cacheAge = Date.now() - lastLoadTime;
      if (cacheAge < CACHE_TTL_MS) {
        console.log('📦 Using cached knowledge base (age:', Math.round(cacheAge / 1000), 'seconds)');
        return knowledgeBaseCache;
      }
    }

    // Load from file
    console.log('📂 Loading knowledge base from file...');
    const filePath = join(process.cwd(), 'data', 'knowledge-base.json');
    const data = readFileSync(filePath, 'utf8');
    const knowledgeBase = JSON.parse(data);

    // Update cache
    knowledgeBaseCache = knowledgeBase;
    lastLoadTime = Date.now();

    console.log('✅ Knowledge base loaded and cached');
    return knowledgeBase;

  } catch (error) {
    console.error('❌ Error loading knowledge base:', error);

    // Return cached version if available
    if (knowledgeBaseCache) {
      console.warn('⚠️ Using stale cached version');
      return knowledgeBaseCache;
    }

    // Fallback to minimal knowledge base
    return {
      event: {
        name: "Lucine di Natale di Leggiuno",
        dates: "6 dicembre 2025 - 6 gennaio 2026",
        hours: "17:30-23:00"
      },
      contact: {
        email: "info@lucinedinatale.it"
      }
    };
  }
}

/**
 * Invalida cache manualmente (utile per aggiornamenti)
 */
export function invalidateCache() {
  console.log('🔄 Knowledge base cache invalidated');
  knowledgeBaseCache = null;
  lastLoadTime = null;
}

/**
 * Setup file watcher per auto-reload
 */
export function setupAutoReload() {
  const filePath = join(process.cwd(), 'data', 'knowledge-base.json');

  try {
    watch(filePath, (eventType, filename) => {
      if (eventType === 'change') {
        console.log('📝 Knowledge base file changed, invalidating cache...');
        invalidateCache();
      }
    });
    console.log('👀 File watcher setup for knowledge base');
  } catch (error) {
    console.error('⚠️ Could not setup file watcher:', error);
  }
}

/**
 * Ottieni statistiche cache
 */
export function getCacheStats() {
  return {
    cached: knowledgeBaseCache !== null,
    lastLoad: lastLoadTime ? new Date(lastLoadTime).toISOString() : null,
    age: lastLoadTime ? Date.now() - lastLoadTime : null,
    ttl: CACHE_TTL_MS
  };
}

export default {
  loadKnowledgeBase,
  invalidateCache,
  setupAutoReload,
  getCacheStats
};
