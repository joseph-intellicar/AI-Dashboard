import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator, type MigrationResultSet } from 'kysely';
import { createDb, describeDbError } from './client';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

async function main() {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const db = createDb({ purpose: 'admin', maxConnections: 1 });
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
  });

  let result: MigrationResultSet;
  try {
    result = direction === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown();
  } catch (err) {
    console.error(`Migration failed: ${describeDbError(err)}`);
    await db.destroy();
    process.exit(1);
  }

  for (const r of result.results ?? []) {
    const mark = r.status === 'Success' ? '✓' : r.status === 'Error' ? '✗' : '–';
    console.log(`${mark} ${r.direction.toLowerCase()} ${r.migrationName}`);
  }
  if (result.error) {
    console.error(`Migration failed: ${describeDbError(result.error)}`);
    await db.destroy();
    process.exit(1);
  }
  if (!result.results?.length) console.log('No pending migrations.');
  await db.destroy();
}

main();
