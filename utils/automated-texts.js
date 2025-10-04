/**
 * 📝 AUTOMATED TEXTS UTILITY
 * Helper per recuperare testi automatici dal database
 */

import container from '../config/container.js';

// Cache in-memory per performance
const textsCache = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

/**
 * Recupera un testo automatico per chiave
 * @param {string} key - Chiave del testo
 * @param {object} variables - Variabili da sostituire (es: {name: 'Mario', ticketNumber: '123'})
 * @returns {Promise<string>} Testo formattato
 */
export async function getAutomatedText(key, variables = {}) {
  try {
    const prisma = container.get('prisma');

    // Check cache
    const now = Date.now();
    if (textsCache.has(key) && (now - lastCacheUpdate) < CACHE_TTL) {
      return replaceVariables(textsCache.get(key), variables);
    }

    // Fetch from DB
    const textRecord = await prisma.automatedText.findUnique({
      where: { key, isActive: true }
    });

    if (!textRecord) {
      console.warn(`⚠️ Automated text not found: ${key}`);
      return `[Missing text: ${key}]`;
    }

    // Update cache
    textsCache.set(key, textRecord.text);
    lastCacheUpdate = now;

    return replaceVariables(textRecord.text, variables);

  } catch (error) {
    console.error(`❌ Error fetching automated text ${key}:`, error);
    return `[Error loading text: ${key}]`;
  }
}

/**
 * Recupera tutti i testi di una categoria
 * @param {string} category - Categoria testi
 * @returns {Promise<Array>} Array di testi
 */
export async function getTextsByCategory(category) {
  try {
    const prisma = container.get('prisma');

    const texts = await prisma.automatedText.findMany({
      where: { category, isActive: true },
      orderBy: { key: 'asc' }
    });

    return texts;

  } catch (error) {
    console.error(`❌ Error fetching texts by category ${category}:`, error);
    return [];
  }
}

/**
 * Sostituisce variabili nel testo
 * @param {string} text - Testo con placeholder {variabile}
 * @param {object} variables - Oggetto con le variabili
 * @returns {string} Testo con variabili sostituite
 */
function replaceVariables(text, variables) {
  if (!text || !variables || Object.keys(variables).length === 0) {
    return text;
  }

  let result = text;

  // Replace {variable} with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value || '');
  }

  return result;
}

/**
 * Invalida la cache (utile dopo aggiornamenti)
 */
export function clearTextsCache() {
  textsCache.clear();
  lastCacheUpdate = 0;
  console.log('🧹 Automated texts cache cleared');
}

export default {
  getAutomatedText,
  getTextsByCategory,
  clearTextsCache
};
