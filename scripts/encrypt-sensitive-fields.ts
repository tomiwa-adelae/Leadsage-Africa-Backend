/**
 * One-time migration: encrypt plain-text BVN and NIN values already in the DB.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register scripts/encrypt-sensitive-fields.ts
 *
 * Requires ENCRYPTION_KEY and DATABASE_URL to be set in the environment (or .env).
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import {
  createCipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

neonConfig.webSocketConstructor = ws;

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SEP = ':';

function buildKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set');
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return scryptSync(raw, 'leadsage-salt', 32);
}

function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(SEP);
}

function isEncrypted(value: string): boolean {
  const parts = value.split(SEP);
  return (
    parts.length === 3 &&
    parts[0].length === IV_LEN * 2 &&
    parts[1].length === TAG_LEN * 2
  );
}

async function main() {
  const key = buildKey();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaNeon({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  // ── BVN on WalletAccount ──────────────────────────────────────────────────
  const wallets = await prisma.walletAccount.findMany({
    where: { bvn: { not: null } },
    select: { id: true, bvn: true },
  });

  let bvnUpdated = 0;
  for (const w of wallets) {
    if (!w.bvn || isEncrypted(w.bvn)) continue;
    await prisma.walletAccount.update({
      where: { id: w.id },
      data: { bvn: encrypt(key, w.bvn) },
    });
    bvnUpdated++;
  }
  console.log(`BVN: encrypted ${bvnUpdated} of ${wallets.length} records`);

  // ── NIN on User ───────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { nin: { not: null } },
    select: { id: true, nin: true },
  });

  let userNinUpdated = 0;
  for (const u of users) {
    if (!u.nin || isEncrypted(u.nin)) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { nin: encrypt(key, u.nin) },
    });
    userNinUpdated++;
  }
  console.log(`User NIN: encrypted ${userNinUpdated} of ${users.length} records`);

  // ── NIN on Application (screening) ───────────────────────────────────────
  const apps = await prisma.application.findMany({
    where: { nin: { not: null } },
    select: { id: true, nin: true },
  });

  let appNinUpdated = 0;
  for (const a of apps) {
    if (!a.nin || isEncrypted(a.nin)) continue;
    await prisma.application.update({
      where: { id: a.id },
      data: { nin: encrypt(key, a.nin) },
    });
    appNinUpdated++;
  }
  console.log(`Application NIN: encrypted ${appNinUpdated} of ${apps.length} records`);

  await prisma.$disconnect();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
