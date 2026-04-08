// Re-export the shared Prisma instance.
// Next.js API routes import from '@/lib/db', the custom server imports from './src/lib/db-server'.
// Both resolve to the same singleton via globalThis.
export { prisma } from './db-server';
