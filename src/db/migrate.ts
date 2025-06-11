import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { config } from '@/utils/config';

const sqlite = new Database(config.DB_FILE_NAME);
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './drizzle' });
