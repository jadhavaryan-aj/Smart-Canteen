/**
 * Test helpers that reproduce how Supabase executes API requests: each call is
 * its own transaction, run as the API role (anon / authenticated /
 * service_role) with the caller's JWT claims in `request.jwt.claims`.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, inject } from 'vitest';

import { toRpcError, type RpcClient } from '../../functions/_shared/rpc.ts';

export interface Session {
  role: 'anon' | 'authenticated' | 'service_role';
  claims: Record<string, unknown>;
  label: string;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: inject('dbUrl'), max: 12 });
  }
  return pool;
}

afterAll(async () => {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
});

export const sessions = {
  anon: (): Session => ({ role: 'anon', claims: { role: 'anon' }, label: 'anon' }),
  student: (userId: string): Session => ({
    role: 'authenticated',
    claims: { sub: userId, role: 'authenticated', is_anonymous: true },
    label: `student:${userId}`,
  }),
  user: (userId: string): Session => ({
    role: 'authenticated',
    claims: { sub: userId, role: 'authenticated', is_anonymous: false },
    label: `user:${userId}`,
  }),
  service: (): Session => ({ role: 'service_role', claims: { role: 'service_role' }, label: 'service' }),
};

/** Runs `sql` in its own transaction as the given session. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  session: Session,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${session.role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(session.claims)]);
    const result = await client.query<T>(sql, params);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Runs SQL as the database owner (like the Supabase SQL editor / migrations). */
export async function superQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

/** An RpcClient backed by Postgres, mirroring how PostgREST calls functions with named arguments. */
export class PgRpcClient implements RpcClient {
  constructor(private readonly session: Session) {}

  async call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!/^[a-z_]+$/.test(fn)) throw new Error(`Invalid function name ${fn}`);
    const entries = Object.entries(args);
    const placeholders = entries.map(([name], index) => {
      if (!/^p_[a-z_]+$/.test(name)) throw new Error(`Invalid argument name ${name}`);
      return `${name} => $${index + 1}`;
    });
    const values = entries.map(([, value]) =>
      value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
    );
    try {
      const result = await query<{ result: T }>(
        this.session,
        `select public.${fn}(${placeholders.join(', ')}) as result`,
        values,
      );
      return result.rows[0]?.result as T;
    } catch (error) {
      throw toRpcError(error as pg.DatabaseError);
    }
  }
}

export function rpc(session: Session): PgRpcClient {
  return new PgRpcClient(session);
}

export async function createUser(
  options: { anonymous?: boolean; email?: string; displayName?: string } = {},
) {
  const id = randomUUID();
  await superQuery(
    `insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values ($1, $2, $3, $4)`,
    [
      id,
      options.email ?? null,
      options.anonymous ?? true,
      JSON.stringify(options.displayName ? { display_name: options.displayName } : {}),
    ],
  );
  return id;
}

export async function createStaff(role: 'admin' | 'staff', displayName = `Test ${role}`) {
  const id = await createUser({ anonymous: false, email: `${randomUUID()}@example.test`, displayName });
  await superQuery(`insert into public.user_roles (user_id, role) values ($1, $2)`, [id, role]);
  return id;
}

/** Expects a promise to reject with a given RPC / Postgres error code or message fragment. */
export async function expectDbError(
  promise: Promise<unknown>,
  expected: string | RegExp,
): Promise<pg.DatabaseError> {
  try {
    await promise;
  } catch (error) {
    const err = error as pg.DatabaseError & { code?: string };
    const text = `${err.message} ${(err as { code?: string }).code ?? ''}`;
    const matches = typeof expected === 'string' ? text.includes(expected) : expected.test(text);
    if (!matches) {
      throw new Error(`Expected error matching ${String(expected)} but got: ${text}`, { cause: error });
    }
    return err;
  }
  throw new Error(`Expected an error matching ${String(expected)}, but the call succeeded`);
}

export const SEED = {
  categories: {
    breakfast: '5eed0000-0000-4000-a000-000000000001',
    snacks: '5eed0000-0000-4000-a000-000000000003',
  },
  items: {
    masalaDosa: '5eed0000-0000-4000-b000-000000000101', // ₹70, options: extra chutney ₹0, butter roast ₹10
    idli: '5eed0000-0000-4000-b000-000000000102', // ₹50
    alooParatha: '5eed0000-0000-4000-b000-000000000104', // seeded as sold out
    biryani: '5eed0000-0000-4000-b000-000000000204', // ₹140, options: raita ₹15, egg ₹15
    sandwich: '5eed0000-0000-4000-b000-000000000303', // ₹60, option cheese ₹15
    chai: '5eed0000-0000-4000-b000-000000000401', // ₹15
    coldCoffee: '5eed0000-0000-4000-b000-000000000403', // ₹50
  },
  options: {
    extraChutney: '5eed0000-0000-4000-8000-000000000001',
    butterRoast: '5eed0000-0000-4000-8000-000000000002',
    extraRaita: '5eed0000-0000-4000-8000-000000000003',
    boiledEgg: '5eed0000-0000-4000-8000-000000000004',
    sandwichCheese: '5eed0000-0000-4000-8000-000000000005',
  },
} as const;
