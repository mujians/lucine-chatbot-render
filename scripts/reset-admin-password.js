/**
 * 🔐 Reset Admin Password Script
 * Use this to reset the admin password if you're locked out
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function resetAdminPassword() {
    try {
        console.log('🔐 Resetting admin password...');

        // New password
        const newPassword = process.env.NEW_ADMIN_PASSWORD || 'admin123';
        console.log(`📝 New password will be: ${newPassword}`);

        // Hash password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Find admin user
        const admin = await prisma.operator.findUnique({
            where: { username: 'admin' }
        });

        if (admin) {
            // Update existing admin
            await prisma.operator.update({
                where: { username: 'admin' },
                data: {
                    passwordHash: hashedPassword,
                    isActive: true,
                    isOnline: false
                }
            });
            console.log('✅ Admin password updated successfully!');
        } else {
            // Create new admin
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
            console.log('✅ Admin user created successfully!');
        }

        console.log('\n🎉 Success! You can now login with:');
        console.log(`   Username: admin`);
        console.log(`   Password: ${newPassword}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetAdminPassword();
