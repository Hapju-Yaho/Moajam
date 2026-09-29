import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { sqliteSchema, repairLegacyProfileParts } from './sqlite-schema.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
config({ path: ['.env.local', '.env'], quiet: true });
const prisma = resolve(root, '../../node_modules/prisma/build/index.js');
function run(args) {
  const result = spawnSync(process.execPath, [prisma, ...args], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const schema = sqliteSchema(readFileSync('prisma/schema.prisma', 'utf8'));
writeFileSync(
  'prisma/sqlite.prisma',
  '// Generated from schema.prisma by scripts/database.mjs.\n' + schema,
);
if (process.argv.includes('--generate')) {
  run(['generate', '--config', 'prisma.config.ts']);
  run(['generate', '--config', 'prisma.sqlite.config.ts']);
} else if (process.argv.includes('--studio')) {
  run([
    'studio',
    '--config',
    process.env.DATABASE_URL?.trim() ? 'prisma.config.ts' : 'prisma.sqlite.config.ts',
  ]);
} else if (!process.env.DATABASE_URL?.trim()) {
  const dataRoot = resolve(root, '../../data');
  const directory =
    process.env.NODE_ENV === 'test' && process.env.MOAJAM_TEST_DATA_DIRECTORY
      ? resolve(process.env.MOAJAM_TEST_DATA_DIRECTORY)
      : dataRoot;
  if (directory !== dataRoot && !directory.startsWith(dataRoot + sep))
    throw new Error('Test database must be inside project data directory');
  mkdirSync(directory, { recursive: true });
  const database = resolve(directory, 'moajam.db');
  closeSync(openSync(database, 'a'));
  // No --accept-data-loss: schema changes requiring deletion must be reviewed explicitly.
  run(['db', 'push', '--config', 'prisma.sqlite.config.ts']);
  const repaired = repairLegacyProfileParts(database);
  if (repaired) console.log(`Repaired ${repaired} empty profile session selections.`);
} else if (process.argv.includes('--deploy')) {
  run(['migrate', 'deploy', '--config', 'prisma.config.ts']);
} else if (process.argv.includes('--migrate')) {
  run([
    'migrate',
    'dev',
    '--config',
    'prisma.config.ts',
    ...process.argv.slice(2).filter((value) => value !== '--migrate'),
  ]);
} else {
  console.log(
    'External PostgreSQL selected. Apply migrations with npm run prisma:deploy --workspace @moajam/server.',
  );
}
