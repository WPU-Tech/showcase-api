import { cleanEnv, str, num } from 'envalid';

export const config = cleanEnv(process.env, {
    PORT: num({ default: 3000 }),
    CORS_ORIGINS: str(),
    SCRAPE_API_KEY: str(),

    GITHUB_TOKEN: str(),
    GITHUB_REPO_OWNER: str({ default: 'sandhikagalih' }),
    GITHUB_REPO_NAME: str({ default: 'project-kalian' }),

    DB_FILE_NAME: str({ default: 'db.sqlite' }),

    NODE_ENV: str({ choices: ['development', 'test', 'production', 'staging'] }),

    CONCURRENCY_LIMIT: num({ default: 5 }),
});
