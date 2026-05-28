import { PrismaClient } from '@prisma/client';

// Singleton do Prisma Client
let _prisma = null;

export const prisma = new Proxy(
  {},
  {
    get(_, prop) {
      if (!_prisma) {
        _prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
        });
      }
      return _prisma[prop];
    },
  }
);

export async function disconnectDB() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
