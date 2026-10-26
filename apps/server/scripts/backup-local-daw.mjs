import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const server = fileURLToPath(new URL('../', import.meta.url));
config({ path: [resolve(server, '.env.local'), resolve(server, '.env')], quiet: true });
if (process.env.DATABASE_URL?.trim())
  throw Error('This backup command only supports local SQLite. Use pg_dump for PostgreSQL.');
const data = resolve(server, '../../data');
const directory = resolve(
  data,
  'backups',
  `before-daw-projects-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(resolve(data, 'moajam.db'));
try {
  db.prepare('VACUUM INTO ?').run(resolve(directory, 'moajam.db'));
} finally {
  db.close();
}
if (existsSync(resolve(data, 'files')))
  cpSync(resolve(data, 'files'), resolve(directory, 'files'), { recursive: true });
console.log('SQLite and local files backup:', directory);
