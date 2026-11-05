import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/hash';
import { normalizeEmail } from '../src/validators/auth.schema';

const prisma = new PrismaClient();

/**
 * Seed an admin account into the database.
 * Controlled process - not public registration.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@edubridge.com ADMIN_PASSWORD=secure_password_here \
 *   npx ts-node prisma/seed.ts
 *
 * Environment variables:
 *   ADMIN_EMAIL    - Email for the admin account (required)
 *   ADMIN_PASSWORD - Password for the admin account (required, min 8 chars)
 *
 * Security:
 *   - Password is hashed with bcrypt before storage
 *   - Password is never logged
 *   - Checks if admin already exists before creating
 */
async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('[Seeder] ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
    console.error('[Seeder] Example: ADMIN_EMAIL=admin@edubridge.com ADMIN_PASSWORD=secure_pass npx ts-node prisma/seed.ts');
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error('[Seeder] ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  try {
    // Check if any admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, email: true },
    });

    if (existingAdmin) {
      console.log(`[Seeder] Admin account already exists: ${existingAdmin.email}`);
      console.log('[Seeder] Skipping admin creation.');
      process.exit(0);
    }

    // Check if email is already used
    const normalizedEmail = normalizeEmail(adminEmail);
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (existingUser) {
      console.error(`[Seeder] Email ${normalizedEmail} is already registered`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await hashPassword(adminPassword);

    // Create admin account
    const admin = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log('[Seeder] Admin account created successfully:');
    console.log(`[Seeder]   ID:    ${admin.id}`);
    console.log(`[Seeder]   Email: ${admin.email}`);
    console.log(`[Seeder]   Role:  ${admin.role}`);
    console.log('[Seeder]   Password: [HIDDEN - never logged]');
    console.log('[Seeder] Admin seeding completed.');
  } catch (error: any) {
    console.error('[Seeder] Error seeding admin account:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();