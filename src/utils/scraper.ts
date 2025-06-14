import { db } from '@/db';
import { cacheTable, CreateProject, projectsTable } from '@/db/schema';
import captureWebsite from 'capture-website';
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { parseMarkdownContent, RawProject, RawWeek } from './markdown';
import { config } from './config';
import { getBranches, getReadmeContent, getSeasonNumber } from './github';

const CACHE_TYPES = {
    BRANCH: 'branch',
    PROJECT: 'project',
} as const;

const SCREENSHOT = {
    EXTENSION: '.webp',
    PREFIX: 'screenshots/',
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    CAPTURE_OPTIONS: {
        delay: 2,
        disableAnimations: true,
        type: 'webp',
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        styles: ['html, body { overflow: hidden !important; }'] as string[],
        overwrite: true,
        timeout: 10,
    },
} as const;

type Project = CreateProject & { block: string };
interface CacheEntry {
    hash: string;
    updated_at: string | null;
}

let isScraping = false;
const cache = new Map<string, CacheEntry>();
const limit = pLimit(config.CONCURRENCY_LIMIT);

const generateHash = (content: string) => crypto.createHash('md5').update(content).digest('hex');

const generateProjectIdentifier = (branch: string, order: number, date: Date) =>
    `${branch}-${date.toISOString().split('T')[0]}-${order}`.replace(/-/g, '_');

const hasRecentScreenshot = async (filePath: string) => {
    if (!existsSync(filePath)) return false;
    const stats = await stat(filePath);
    return Date.now() - stats.mtimeMs < SCREENSHOT.CACHE_DURATION;
};

const captureScreenshot = async (project: RawProject, identifier: string) => {
    const fileName = `${SCREENSHOT.PREFIX}${identifier}${SCREENSHOT.EXTENSION}`;
    const filePath = path.join(process.cwd(), fileName);

    if (await hasRecentScreenshot(filePath)) return { url: fileName, identifier };

    try {
        await captureWebsite.file(project.link, filePath, SCREENSHOT.CAPTURE_OPTIONS);
        return { url: fileName, identifier };
    } catch {
        console.error(`Failed to capture screenshot for ${project.link}`);
        return { url: null, identifier };
    }
};

const updateCache = async (type: string, name: string, hash: string) => {
    const now = new Date().toISOString();
    await db
        .insert(cacheTable)
        .values({ type, name, hash })
        .onConflictDoUpdate({
            target: [cacheTable.type, cacheTable.name],
            set: { hash, updated_at: now },
        });
    cache.set(`${type}:${name}`, { hash, updated_at: now });
};

const insertProjects = async (projects: Project[]) => {
    if (!projects.length) return;
    console.log(`Inserting ${projects.length} projects...`);
    await db.transaction(async (tx) => {
        const now = new Date().toISOString();
        await Promise.all(
            projects.map((project) =>
                limit(async () => {
                    const projectHash = generateHash(project.block);
                    try {
                        await tx
                            .insert(projectsTable)
                            .values(project)
                            .onConflictDoUpdate({
                                target: [projectsTable.identifier],
                                set: { ...project, updated_at: now },
                            });
                        await updateCache(CACHE_TYPES.PROJECT, project.identifier, projectHash);
                    } catch (error) {
                        console.error(`Failed to insert project ${project.identifier}:`, error);
                        throw error;
                    }
                })
            )
        );
    });
    console.log(`Inserted ${projects.length} projects.`);
};

const processWeek = async (week: RawWeek, branch: string, seasonNumber: number) => {
    const projects: Project[] = [];
    const screenshotTasks = week.projects
        .map((project) => ({
            project,
            identifier: generateProjectIdentifier(branch, project.order, week.date),
        }))
        .filter(
            ({ identifier, project }) =>
                cache.get(`${CACHE_TYPES.PROJECT}:${identifier}`)?.hash !== generateHash(project.block)
        )
        .map(({ project, identifier }) => limit(() => captureScreenshot(project, identifier)));

    const screenshots = await Promise.all(screenshotTasks);

    for (const project of week.projects) {
        const identifier = generateProjectIdentifier(branch, project.order, week.date);
        const projectHash = generateHash(project.block);
        if (cache.get(`${CACHE_TYPES.PROJECT}:${identifier}`)?.hash === projectHash) continue;

        projects.push({
            ...project,
            season: seasonNumber,
            branch,
            date: week.date.toISOString(),
            identifier,
            screenshot: screenshots.find((s) => s?.identifier === identifier)?.url ?? null,
            block: project.block,
            link_lower: project.link.toLowerCase(),
            creator_lower: project.creator?.toLowerCase(),
        });
    }

    await insertProjects(projects);
};

const processBranch = async (branch: string) => {
    const content = await getReadmeContent(branch);
    if (!content) {
        console.warn(`No content for branch: ${branch}`);
        return;
    }

    const contentHash = generateHash(content);
    const cacheKey = `${CACHE_TYPES.BRANCH}:${branch}`;
    if (cache.get(cacheKey)?.hash === contentHash) {
        console.log(`Cache hit for branch: ${branch}`);
        return;
    }

    console.log(`Processing branch: ${branch}`);
    const seasonNumber = getSeasonNumber(branch);
    const weeks = parseMarkdownContent(content);
    for (const week of weeks) await processWeek(week, branch, seasonNumber);
    await updateCache(CACHE_TYPES.BRANCH, branch, contentHash);
};

const loadCache = async () => {
    cache.clear();
    const cacheData = await db.select().from(cacheTable);
    cacheData.forEach(({ name, hash, type, updated_at }) => {
        cache.set(`${type}:${name}`, { hash, updated_at });
    });
};

export const scrapeProject = async () => {
    if (isScraping) {
        console.log('Scraping in progress.');
        return;
    }

    isScraping = true;
    try {
        await loadCache();
        const branches = await getBranches();
        await Promise.all(branches.map(processBranch));
        console.log('Scraping completed.');
    } catch (error) {
        console.error('Scraping failed:', error);
    } finally {
        isScraping = false;
    }
};
