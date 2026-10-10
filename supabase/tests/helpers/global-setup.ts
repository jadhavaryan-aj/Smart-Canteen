/**
 * Creates a throwaway database, applies the Supabase shim, every migration in
 * order and the seed, then exposes its URL to the tests via `inject('dbUrl')`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import type { TestProject } from 'vitest/node';

const root = path.resolve(__dirname, '../../..');

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export default async function setup(project: TestProject) {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Run `npm run test:db` (which starts a temporary PostgreSQL) or point DATABASE_URL at a PostgreSQL 15+ server.',
    );
  }

  const database = `campus_table_test_${process.pid}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.query(`create database ${database}`);
  await admin.end();

  const dbUrl = withDatabase(baseUrl, database);
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('set client_min_messages = warning');
    await client.query(readFileSync(path.join(root, 'supabase/tests/shim/supabase-shim.sql'), 'utf8'));
    const migrationsDir = path.join(root, 'supabase/migrations');
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      try {
        await client.query(readFileSync(path.join(migrationsDir, file), 'utf8'));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
    await client.query(readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8'));
    // Tests control opening hours explicitly; by default ordering is open.
    await client.query('update public.canteen_settings set enforce_opening_hours = false');
  } finally {
    await client.end();
  }

  project.provide('dbUrl', dbUrl);

  return async () => {
    const cleanup = new pg.Client({ connectionString: baseUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${database} with (force)`);
    await cleanup.end();
  };
}
