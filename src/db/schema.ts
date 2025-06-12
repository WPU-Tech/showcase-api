import { int, sqliteTable, unique, text, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';

export const projectsTable = sqliteTable(
    'projects',
    {
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
        creator_lower: text(), // for search optimization
        link_lower: text().notNull(), // for search optimization
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text(),
    },
    (t) => [
        index('creator_lower_idx_for_search').on(t.creator_lower),
        index('link_lower_idx_for_search').on(t.link_lower),
        index('season_idx').on(t.season),
        index('order_idx').on(t.order),
    ]
);

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
        updated_at: text(),
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
export type SelectProject = InferSelectModel<typeof projectsTable>;
export type SelectCache = InferSelectModel<typeof cacheTable>;
