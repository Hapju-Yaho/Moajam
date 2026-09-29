import { DatabaseSync } from 'node:sqlite';

export function sqliteSchema(source) {
  return (
    source
      .replace('provider = "postgresql"', 'provider = "sqlite"')
      .replace('../src/generated/prisma', '../src/generated/sqlite')
      .replace(/\s+@db\.\w+(?:\([^)]*\))?/g, '')
      // Prisma db push can render JSON array defaults as bare [], which SQLite stores as ''.
      // Keep the SQL string literal explicit so both db push and migrate diff produce valid JSON.
      .replace(/(\bJson\b[^\r\n]*?)@default\("\[\]"\)/g, '$1@default(dbgenerated("\'[]\'"))')
  );
}

export function repairLegacyProfileParts(path) {
  const db = new DatabaseSync(path);
  try {
    // Only the broken, unset legacy value is repaired. Never replace valid selections.
    return db
      .prepare("UPDATE profiles SET parts = '[]' WHERE typeof(parts) = 'text' AND parts = ''")
      .run().changes;
  } finally {
    db.close();
  }
}
