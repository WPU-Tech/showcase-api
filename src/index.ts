import { Elysia } from 'elysia';
import { config } from './utils/config';
import { scraper } from './utils/scraper';
import { db } from './db';
import { projectsTable } from './db/schema';
import { eq, like, or, sql } from 'drizzle-orm';

const app = new Elysia({
    prefix: '/api',
})
    .get('/scrape', async ({ request, status }) => {
        const availableKeys = config.SCRAPE_API_KEY.split(',');
        const apiKey = request.headers.get('x-scraper-api-key');

        if (!apiKey || !availableKeys.includes(apiKey)) {
            return status(401);
        }

        scraper.scrapeProject();

        return { message: 'Scraping in progress' };
    })
    .get('/projects', async ({ query }) => {
        const search = query.search || '';

        const projects = await db
            .select()
            .from(projectsTable)
            .where(
                or(
                    like(projectsTable.link_lower, sql`LOWER('%${search}%')`),
                    like(projectsTable.creator_lower, sql`LOWER('%${search}%')`)
                )
            );

        return { message: 'Success', status: true, data: projects };
    })
    .listen(config.PORT);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
