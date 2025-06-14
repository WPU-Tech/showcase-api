import { Elysia } from 'elysia';
import { config } from './utils/config';
import { db } from './db';
import { projectsTable } from './db/schema';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { getMetadata, transformProjects } from './utils/project';
import { staticPlugin } from '@elysiajs/static';
import { scrapeProject } from './utils/scraper';

const app = new Elysia()
    .use(staticPlugin({ assets: 'screenshots', prefix: '/screenshots' }))
    .post('/api/scrape', async ({ request, status }) => {
        const availableKeys = config.SCRAPE_API_KEY.split(',');
        const apiKey = request.headers.get('x-scraper-api-key');

        if (!apiKey || !availableKeys.includes(apiKey)) {
            return status(401);
        }

        scrapeProject();

        return { message: 'Scraping running' };
    })
    .get('/api/projects', async ({ query }) => {
        const search = query.search || '';
        const season = isNaN(parseInt(query.season)) ? 5 : parseInt(query.season);
        const raw = query.raw === 'true';

        const projects = await db
            .select()
            .from(projectsTable)
            .where(
                and(
                    or(
                        like(projectsTable.link_lower, sql`'%' || LOWER(${search}) || '%'`),
                        like(projectsTable.creator_lower, sql`'%' || LOWER(${search}) || '%'`)
                    ),
                    eq(projectsTable.season, season)
                )
            )
            .orderBy(sql`datetime(${projectsTable.date})`, projectsTable.order);

        const data = raw ? projects : projects.length ? transformProjects(projects) : {};

        return {
            message: 'Success',
            status: true,
            data,
        };
    })
    .get('/api/metadata', async () => {
        const projects = await db
            .select()
            .from(projectsTable)
            .orderBy(projectsTable.season, sql`datetime(${projectsTable.date})`, projectsTable.order);

        return {
            message: 'Success',
            status: true,
            data: getMetadata(projects),
        };
    })
    .listen(config.PORT);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
