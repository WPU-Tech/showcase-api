import { drizzle } from 'drizzle-orm/bun-sqlite';
import { config } from '@/utils/config';
import { Database } from 'bun:sqlite';

const sqlite = new Database(config.DB_FILE_NAME);
export const db = drizzle(sqlite);
