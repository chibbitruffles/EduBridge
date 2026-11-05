import { PrismaClient } from '@prisma/client';

// Singleton Prisma client to avoid multiple instances in development
// with hot-reloading (ts-node)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export default db;