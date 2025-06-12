import { db } from '@/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

migrate(db, { migrationsFolder: './drizzle' });
