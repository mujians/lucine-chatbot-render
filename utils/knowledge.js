import { prisma } from '../server.js';

// Default knowledge base from original system
const defaultKnowledgeBase = {
  event: {
    name: "Lucine di Natale di Leggiuno",
    dates: {
      start: "2025-12-06",
      end: "2026-01-06",
      closed: ["2025-12-24", "2025-12-31"]
    },
    hours: {
      open: "17:30",
      close: "23:00",
      lastEntry: "22:30"
    },
    location: {
      city: "Leggiuno",
      province: "Varese",
      region: "Lombardia",
      area: "Lago Maggiore",
      coordinates: {
        lat: 45.8776751,
        lng: 8.62088
      }
    }
  },
  tickets: {
    prices: {
      intero: 9,
      ridotto: 7,
      saltafila: 13,
      open: 25,
      under3: 0
    }
  },
  parking: {
    lots: {
      P1: { name: "Campo Sportivo", features: ["auto", "camper"], walkTime: "10 min" },
      P2: { name: "Manifattura", features: ["auto"], shuttle: true },
      P3: { name: "Chiesa S.Stefano", features: ["auto", "disabili"], walkTime: "2 min" },
      P4: { name: "Scuole medie", features: ["auto", "camper"], shuttle: true },
      P5: { name: "S.Caterina", features: ["auto", "camper", "bus turistici"], shuttle: true }
    },
    shuttle: {
      hours: "16:30-22:30",
      frequency: "ogni 15 minuti",
      cost: "gratuita"
    }
  },
  services: {
    accessibility: {
      wheelchairs: true,
      strollers: true
    },
    pets: {
      allowed: true,
      requirements: ["guinzaglio", "museruola per taglie grandi"]
    }
  }
};

export async function loadKnowledgeBase() {
  try {
    // Try to load from database
    const items = await prisma.knowledgeItem.findMany({
      where: { isActive: true }
    });

    if (items.length > 0) {
      // Convert DB items to knowledge base format
      const knowledge = {
        ...defaultKnowledgeBase,
        faq: items.map(item => ({
          category: item.category,
          q: item.question,
          a: item.answer
        }))
      };
      return knowledge;
    }
  } catch (error) {
    console.error('Error loading knowledge from DB:', error);
  }

  // Fallback to default
  return defaultKnowledgeBase;
}