/**
 * 🔐 Ensure Admin Exists - Auto-run on server startup
 * This will create or update admin user with password from env variable
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

export async function ensureAdminExists(prismaInstance = null) {
    try {
        // Use provided prisma instance or create new one
        const prisma = prismaInstance || new PrismaClient();
        const shouldDisconnect = !prismaInstance; // Only disconnect if we created it

        const adminPassword = process.env.ADMIN_PASSWORD || 'lucine2025admin';

        console.log('🔐 Checking admin user...');

        // Check if admin exists
        const existingAdmin = await prisma.operator.findUnique({
            where: { username: 'admin' }
        });

        if (existingAdmin) {
            console.log('✅ Admin user already exists');
            console.log(`   Username: admin`);
            console.log(`   Name: ${existingAdmin.name}`);

            // Option: Update password if FORCE_ADMIN_PASSWORD_UPDATE is set
            if (process.env.FORCE_ADMIN_PASSWORD_UPDATE === 'true') {
                console.log('🔄 Updating admin password...');
                const hashedPassword = await bcrypt.hash(adminPassword, 10);

                await prisma.operator.update({
                    where: { username: 'admin' },
                    data: {
                        passwordHash: hashedPassword,
                        isActive: true
                    }
                });

                console.log('✅ Admin password updated!');
            }
        } else {
            console.log('📝 Creating admin user...');
            const hashedPassword = await bcrypt.hash(adminPassword, 10);

            await prisma.operator.create({
                data: {
                    username: 'admin',
                    email: 'supporto@lucinedinatale.it',
                    name: 'Amministratore',
                    passwordHash: hashedPassword,
                    isActive: true,
                    isOnline: false
                }
            });

            console.log('✅ Admin user created!');
            console.log(`   Username: admin`);
            console.log(`   Password: ${adminPassword}`);
        }

        // Cleanup if we created our own connection
        if (shouldDisconnect) {
            await prisma.$disconnect();
        }

    } catch (error) {
        console.error('❌ Error ensuring admin exists:', error.message);
        throw error; // Re-throw to prevent server startup if admin setup fails
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    ensureAdminExists()
        .then(() => prisma.$disconnect())
        .catch((e) => {
            console.error(e);
            prisma.$disconnect();
            process.exit(1);
        });
}
