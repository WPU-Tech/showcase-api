import { integer, pgTable, timestamp, unique, text, index, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';

export const projectsTable = pgTable(
    'projects',
    {
        id: text()
            .$defaultFn(() => createId())
            .primaryKey(),
        identifier: varchar().notNull().unique(),
        order: integer().notNull(),
        branch: varchar().notNull(),
        season: integer().notNull(),
        date: timestamp().notNull(),
        creator: varchar(),
        link: varchar().notNull(),
        description: text().notNull(),
        screenshot: varchar(),
        creator_lower: varchar(), // for search optimization
        link_lower: varchar().notNull(), // for search optimization
        created_at: timestamp().defaultNow().notNull(),
        updated_at: timestamp(),
    },
    (t) => [
        index('creator_lower_idx_for_search').on(t.creator_lower),
        index('link_lower_idx_for_search').on(t.link_lower),
        index('season_idx').on(t.season),
        index('order_idx').on(t.order),
    ]
);

export const cacheTable = pgTable(
    'cache',
    {
        id: text()
            .$defaultFn(() => createId())
            .primaryKey(),
        type: varchar().notNull(),
        name: varchar().notNull(),
        hash: varchar().notNull(),
        created_at: timestamp().defaultNow().notNull(),
        updated_at: timestamp(),
    },
    (t) => [unique().on(t.type, t.name)]
);

export const subscribersTable = pgTable('subscribers', {
    id: text()
        .$defaultFn(() => createId())
        .primaryKey(),
    email: varchar().notNull(),
    created_at: timestamp().defaultNow().notNull(),
    deleted_at: timestamp(),
});

export type CreateProject = InferInsertModel<typeof projectsTable>;
export type SelectProject = InferSelectModel<typeof projectsTable>;
export type SelectCache = InferSelectModel<typeof cacheTable>;
