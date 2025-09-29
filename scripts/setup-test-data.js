/**
 * 🔧 Setup Test Data - Lucine di Natale
 * Initializes database with test data for development
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createTestData() {
    console.log('🚀 Creating test data...');
    
    try {
        // Create test admin operator
        const admin = await prisma.operator.upsert({
            where: { username: 'admin' },
            update: {
                isActive: true,
                isOnline: false
            },
            create: {
                username: 'admin',
                email: 'admin@lucinedinatale.it',
                name: 'Admin Test User',
                passwordHash: 'test-hash', // In production use proper hashing
                isActive: true,
                isOnline: false
            }
        });
        console.log('✅ Admin operator created:', admin.username);
        
        // Create test chat session
        const session = await prisma.chatSession.create({
            data: {
                sessionId: 'test-session-' + Date.now(),
                status: 'PENDING_OPERATOR',
                startedAt: new Date(),
                userInfo: {
                    name: 'Test User',
                    email: 'test@example.com'
                }
            }
        });
        console.log('✅ Test session created:', session.sessionId);
        
        // Create test messages
        const messages = await Promise.all([
            prisma.message.create({
                data: {
                    sessionId: session.sessionId,
                    message: 'Ciao! Ho bisogno di aiuto con il mio ordine.',
                    sender: 'USER',
                    timestamp: new Date(Date.now() - 5 * 60 * 1000) // 5 min ago
                }
            }),
            prisma.message.create({
                data: {
                    sessionId: session.sessionId,
                    message: 'Potreste aiutarmi a tracciare la spedizione?',
                    sender: 'USER', 
                    timestamp: new Date(Date.now() - 3 * 60 * 1000) // 3 min ago
                }
            })
        ]);
        console.log('✅ Test messages created:', messages.length);
        
        // Create knowledge base items
        const knowledgeItems = await Promise.all([
            prisma.knowledgeItem.create({
                data: {
                    question: 'Come posso tracciare il mio ordine?',
                    answer: 'Puoi tracciare il tuo ordine utilizzando il numero di tracking che ti abbiamo inviato via email.',
                    category: 'Spedizioni',
                    isActive: true
                }
            }),
            prisma.knowledgeItem.create({
                data: {
                    question: 'Qual è la politica di reso?',
                    answer: 'Accettiamo resi entro 14 giorni dall\'acquisto. Il prodotto deve essere in condizioni originali.',
                    category: 'Resi',
                    isActive: true
                }
            })
        ]);
        console.log('✅ Knowledge base items created:', knowledgeItems.length);
        
        console.log('🎉 Test data setup completed!');
        console.log('📊 Summary:');
        console.log(`   - Admin operator: ${admin.username}`);
        console.log(`   - Test session: ${session.sessionId}`);
        console.log(`   - Messages: ${messages.length}`);
        console.log(`   - Knowledge items: ${knowledgeItems.length}`);
        
    } catch (error) {
        console.error('❌ Error creating test data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    createTestData()
        .then(() => {
            console.log('✅ Test data setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test data setup failed:', error);
            process.exit(1);
        });
}

export { createTestData };