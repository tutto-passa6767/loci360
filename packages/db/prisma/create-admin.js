'use strict';
// Creates or resets a CMS user:
//   npm run admin:create -- editor@loci360.kz "Full Name" "password-10+chars" [ADMIN|EDITOR]
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const [email, name, password, role = 'ADMIN'] = process.argv.slice(2);

async function main() {
  if (!email || !name || !password) {
    console.error('Usage: npm run admin:create -- <email> "<name>" "<password>" [ADMIN|EDITOR]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters');
    process.exit(1);
  }
  if (!['ADMIN', 'EDITOR'].includes(role)) {
    console.error('Role must be ADMIN or EDITOR');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  // Same Argon2id parameters as the API (apps/api/src/auth/auth.service.ts)
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, role, passwordHash, blockedAt: null },
    create: { email: email.toLowerCase(), name, role, passwordHash },
  });
  console.log(`${user.role} ${user.email} is ready`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
