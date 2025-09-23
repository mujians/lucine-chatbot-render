import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create default operator
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const operator = await prisma.operator.upsert({
      where: { email: 'admin@lucinedinatale.it' },
      update: {},
      create: {
        username: 'admin',
        email: 'admin@lucinedinatale.it',
        name: 'Amministratore',
        passwordHash: hashedPassword,
        isActive: true,
        isOnline: false
      }
    });

    console.log('✅ Default operator created:', operator.email);

    // Create sample knowledge items
    const knowledgeItems = [
      {
        category: 'biglietti',
        question: 'Quanto costa il biglietto?',
        answer: 'I prezzi sono: Intero €9, Ridotto €7, Saltafila €13, Open €25, Bambini sotto i 3 anni gratis.',
        keywords: ['prezzo', 'costo', 'biglietto', 'euro']
      },
      {
        category: 'orari',
        question: 'Che orari avete?',
        answer: 'Aperto dal 6 dicembre 2025 al 6 gennaio 2026, dalle 17:30 alle 23:00. Ultimo ingresso alle 22:30. Chiuso il 24 e 31 dicembre.',
        keywords: ['orari', 'apertura', 'chiusura', 'quando']
      },
      {
        category: 'parcheggi',
        question: 'Dove posso parcheggiare?',
        answer: 'Sono disponibili 5 parcheggi: P1 Campo Sportivo, P2 Manifattura, P3 Chiesa S.Stefano (disabili), P4 Scuole medie, P5 S.Caterina. Navetta gratuita ogni 15 minuti dalle 16:30 alle 22:30.',
        keywords: ['parcheggio', 'auto', 'navetta', 'dove']
      }
    ];

    for (const item of knowledgeItems) {
      const existing = await prisma.knowledgeItem.findFirst({
        where: { 
          category: item.category,
          question: item.question
        }
      });
      
      if (!existing) {
        await prisma.knowledgeItem.create({
          data: item
        });
      }
    }

    console.log('✅ Knowledge base seeded');
    console.log('🌱 Database seeding completed!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });