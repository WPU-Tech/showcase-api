import { config } from '@/utils/config';
import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

const client = new SQL(config.DATABASE_URL);
export const db = drizzle({ client });
