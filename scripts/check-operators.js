import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOperators() {
    const operators = await prisma.operator.findMany({
        orderBy: { createdAt: 'asc' }
    });

    console.log(`\n📋 Total operators: ${operators.length}\n`);

    operators.forEach((op, i) => {
        console.log(`${i + 1}. ${op.username} (${op.name})`);
        console.log(`   Email: ${op.email}`);
        console.log(`   Active: ${op.isActive}`);
        console.log(`   Online: ${op.isOnline}`);
        console.log(`   Created: ${op.createdAt}`);
        console.log('');
    });

    await prisma.$disconnect();
}

checkOperators();
