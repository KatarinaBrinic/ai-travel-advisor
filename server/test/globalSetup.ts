import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const dbFile = path.join(serverRoot, 'prisma', 'data', 'test.db');

export default async function setup() {
  for (const f of [dbFile, `${dbFile}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: 'file:./data/test.db' },
    stdio: 'inherit',
  });
}
