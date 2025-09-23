import { prisma } from '../server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase() {
  try {
    console.log('🔍 Checking database tables...');
    
    // Check if tables exist by trying to query one
    await prisma.chatSession.findFirst();
    console.log('✅ Database tables already exist');
    return true;
    
  } catch (error) {
    if (error.code === 'P2021' || error.message.includes('does not exist')) {
      console.log('📊 Creating database tables...');
      
      try {
        // Read migration file
        const migrationPath = path.join(__dirname, '../prisma/migrations/20250923150000_init/migration.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute migration using raw SQL
        const statements = migrationSQL
          .split(';')
          .filter(statement => statement.trim().length > 0)
          .map(statement => statement.trim() + ';');
        
        for (const statement of statements) {
          if (statement.trim()) {
            await prisma.$executeRawUnsafe(statement);
          }
        }
        
        console.log('✅ Database tables created successfully');
        return true;
        
      } catch (migrationError) {
        console.error('❌ Failed to create tables:', migrationError);
        return false;
      }
      
    } else {
      console.error('❌ Database connection error:', error);
      return false;
    }
  }
}