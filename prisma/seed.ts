import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as bcrypt from 'bcryptjs';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@leadsageafrica.com';
  const password = 'Password@12345';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('⚠️  Admin user already exists, skipping seed.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      firstName: 'Leadsage',
      lastName: 'Admin',
      email,
      password: hashedPassword,
      username: 'leadsage-admin',
      role: 'ADMIN',
      emailVerified: true,
      onboardingCompleted: true,
    },
  });

  await prisma.admin.create({
    data: {
      userId: user.id,
      position: 'SUPER_ADMIN',
    },
  });

  console.log(`✅ Admin seeded: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
