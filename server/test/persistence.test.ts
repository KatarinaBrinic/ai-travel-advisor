import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const dbFile = path.join(serverRoot, 'prisma', 'data', 'test-persistence.db');
const databaseUrl = 'file:./data/test-persistence.db';

// Uses its own dedicated database file so it can't collide with the
// CRUD suite's shared test.db and the truncation it does between tests.
beforeAll(() => {
  for (const f of [dbFile, `${dbFile}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
});

afterAll(() => {
  for (const f of [dbFile, `${dbFile}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
});

describe('persistence across a process restart', () => {
  it('is readable by a fresh Prisma client instance pointed at the same file', async () => {
    const clientA = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const traveler = await clientA.traveler.create({ data: {} });
    const conversation = await clientA.conversation.create({
      data: { travelerId: traveler.id, title: 'Restart check' },
    });
    await clientA.message.create({
      data: { conversationId: conversation.id, role: 'user', content: 'still here?' },
    });
    await clientA.$disconnect();

    // A brand new client against the same file stands in for a process
    // restart: nothing in the app keeps state anywhere but this file.
    const clientB = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const found = await clientB.conversation.findUnique({
      where: { id: conversation.id },
      include: { messages: true },
    });
    expect(found?.title).toBe('Restart check');
    expect(found?.messages).toHaveLength(1);
    expect(found?.messages[0]?.content).toBe('still here?');
    await clientB.$disconnect();
  });
});
