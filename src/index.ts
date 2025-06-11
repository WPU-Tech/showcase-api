import { Elysia } from 'elysia';
import { config } from './utils/config';
import { scraper } from './utils/scraper';

const app = new Elysia({
    prefix: '/api',
})
    .get('/scrape', async ({ request, status }) => {
        const availableKeys = config.SCRAPE_API_KEY.split(',');
        const apiKey = request.headers.get('x-scraper-api-key');

        if (!apiKey || !availableKeys.includes(apiKey)) {
            return status(401);
        }

        if (scraper.isScraping) {
            return { message: 'Scraping is already in progress' };
        }

        scraper.scrapeProject();

        return { message: 'Scraping in progress' };
    })
    .listen(config.PORT);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
