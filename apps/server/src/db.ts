// Singleton Prisma client for the whole server (one connection pool per process).
import { PrismaClient } from './generated/prisma/client.js';

export const prisma = new PrismaClient();
