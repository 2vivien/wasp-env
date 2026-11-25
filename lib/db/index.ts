import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '@/lib/env'
import * as schema from './schema'

type PoolCache = typeof globalThis & { waspPool?: Pool }
const globalPool = globalThis as PoolCache

export const pool = globalPool.waspPool ?? new Pool({ connectionString: env.DATABASE_URL })

if (env.NODE_ENV !== 'production') globalPool.waspPool = pool

export const db = drizzle(pool, { schema })
