import { readFileSync } from 'fs';
import { join } from 'path';

// 📚 Carica knowledge base dal JSON (come su Vercel)
export async function loadKnowledgeBase() {
  try {
    const filePath = join(process.cwd(), 'data', 'knowledge-base.json');
    const data = readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading knowledge base:', error);
    return {
      event: { name: "Lucine di Natale di Leggiuno" },
      contact: { email: "info@lucinedinatale.it" }
    };
  }
}