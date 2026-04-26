// server/context.ts
// Dependency-injection container passed into every handler. Lets handlers
// read shared state, emit via io, and query the database without reaching
// for module-level globals.

import type { Server as IOServer } from 'socket.io';
import type { PrismaClient } from '@/generated/prisma/client';
import { type ServerState, createServerState } from './state';

export interface ServerContext {
  io: IOServer;
  prisma: PrismaClient;
  state: ServerState;
  limits: { maxCameras: number; maxScreens: number };
}

export function createServerContext(
  io: IOServer,
  prisma: PrismaClient,
  limits = { maxCameras: 4, maxScreens: 2 },
): ServerContext {
  return {
    io,
    prisma,
    state: createServerState(),
    limits,
  };
}
