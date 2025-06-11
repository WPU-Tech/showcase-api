import { int, sqliteTable, unique, text } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';

export const projectsTable = sqliteTable('projects', {
    id: text()
        .$defaultFn(() => createId())
        .primaryKey(),
    identifier: text().notNull().unique(),
    order: int().notNull(),
    branch: text().notNull(),
    season: int().notNull(),
    date: text().notNull(),
    creator: text(),
    link: text().notNull(),
    description: text().notNull(),
    screenshot: text(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    updated_at: text(),
});

export const cacheTable = sqliteTable(
    'cache',
    {
        id: text()
            .$defaultFn(() => createId())
            .primaryKey(),
        type: text().notNull(),
        name: text().notNull(),
        hash: text().notNull(),
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
    },
    (t) => [unique().on(t.type, t.name)]
);

export const subscribersTable = sqliteTable('subscribers', {
    id: text()
        .$defaultFn(() => createId())
        .primaryKey(),
    email: text().notNull(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    deleted_at: text(),
});

export type CreateProject = InferInsertModel<typeof projectsTable>;
export type SelectCache = InferSelectModel<typeof cacheTable>;
