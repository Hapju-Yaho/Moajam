import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dataRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)), 'data');
export const DATA_DIRECTORY =
  process.env.NODE_ENV === 'test' && process.env.MOAJAM_TEST_DATA_DIRECTORY
    ? resolve(process.env.MOAJAM_TEST_DATA_DIRECTORY)
    : dataRoot;
if (
  DATA_DIRECTORY !== dataRoot &&
  !DATA_DIRECTORY.startsWith(dataRoot + (process.platform === 'win32' ? '\\' : '/'))
)
  throw new Error('Test database must be inside project data directory');
export const LOCAL_DATABASE_URL = `file:${resolve(DATA_DIRECTORY, 'moajam.db').replace(/\\/g, '/')}`;
export function databaseUrl(config: Record<string, unknown>, migration = false): string {
  const external = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL.trim() : '';
  const direct = typeof config.DIRECT_URL === 'string' ? config.DIRECT_URL.trim() : '';
  if (!external) return LOCAL_DATABASE_URL;
  const value = migration ? direct || external : external;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error(
      'DATABASE_URL must start with postgresql:// (not the Supabase HTTPS project URL)',
    );
  return value;
}
