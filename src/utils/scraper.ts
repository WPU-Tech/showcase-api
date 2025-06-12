import { db } from '@/db';
import { cacheTable, CreateProject, projectsTable } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import captureWebsite from 'capture-website';
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { parseMarkdownContent, RawProject, RawWeek } from './markdown';
import { config } from './config';
import { Octokit } from '@octokit/rest';

// Constants
const CACHE_TYPES = {
    BRANCH: 'branch',
    PROJECT: 'project',
} as const;

const SCREENSHOT = {
    EXTENSION: '.webp',
    PREFIX: 'screenshots/',
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
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

type Project = CreateProject & {
    block: string;
};

interface CacheEntry {
    hash: string;
    updated_at: string | null;
}

export class Scraper {
    private isScraping = false;
    private readonly limit = pLimit(config.CONCURRENCY_LIMIT);
    private readonly octokit: Octokit;
    private readonly cache: Map<string, CacheEntry> = new Map();

    constructor() {
        this.octokit = new Octokit({ auth: config.GITHUB_TOKEN });
    }

    async scrapeProject(): Promise<void> {
        if (this.isScraping) {
            console.log('Scraping already in progress.');
            return;
        }

        this.isScraping = true;
        await this.loadCache();

        try {
            const branches = await this.getBranches();
            await Promise.all(branches.map((branch) => this.processBranch(branch)));
            console.log('Scraping completed successfully.');
        } catch (error) {
            console.error('Scraping failed:', error);
        } finally {
            this.isScraping = false;
        }
    }

    private async loadCache(): Promise<void> {
        this.cache.clear();
        const cache = await db.select().from(cacheTable);
        cache.forEach(({ name, hash, type, updated_at }) => {
            this.cache.set(`${type}:${name}`, { hash, updated_at });
        });
    }

    private async processBranch(branch: string): Promise<void> {
        const content = await this.getReadmeContent(branch);
        if (!content) {
            console.warn(`No content found for branch: ${branch}`);
            return;
        }

        const contentHash = this.generateHash(content);
        const cacheKey = `${CACHE_TYPES.BRANCH}:${branch}`;

        if (this.cache.get(cacheKey)?.hash === contentHash) {
            console.log(this.cache.get(cacheKey)?.hash, contentHash);
            console.log(`Cache hit for branch: ${branch}`);
            return;
        }

        console.log(`Processing branch: ${branch}`);
        const seasonNumber = this.getSeasonNumber(branch);
        const weeks = parseMarkdownContent(content);

        for (const week of weeks) {
            await this.processWeek(week, branch, seasonNumber);
        }

        await this.updateCache(CACHE_TYPES.BRANCH, branch, contentHash);
        console.log(`Cache updated for branch: ${branch}`);
    }

    private async processWeek(week: RawWeek, branch: string, seasonNumber: number): Promise<void> {
        console.log(`Processing week: ${week.date.toLocaleDateString()}`);
        const projects: Project[] = [];
        const screenshotTasks = week.projects
            .map((project) => ({
                project,
                identifier: this.generateProjectIdentifier(branch, project.order, week.date),
            }))
            .filter(({ identifier, project }) => {
                const projectHash = this.generateHash(project.block);
                return this.cache.get(`${CACHE_TYPES.PROJECT}:${identifier}`)?.hash !== projectHash;
            })
            .map(({ project, identifier }) => this.limit(() => this.captureScreenshot(project, identifier)));

        const screenshots = await Promise.all(screenshotTasks);

        for (const project of week.projects) {
            const projectHash = this.generateHash(project.block);
            const identifier = this.generateProjectIdentifier(branch, project.order, week.date);

            if (this.cache.get(`${CACHE_TYPES.PROJECT}:${identifier}`)?.hash === projectHash) continue;

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

        if (projects.length > 0) {
            await this.insertProjects(projects);
        }
    }

    private async insertProjects(projects: Project[]): Promise<void> {
        console.log(`Inserting ${projects.length} projects into the database...`);
        await db.transaction(async (tx) => {
            const now = new Date().toISOString();
            const insertTasks = projects.map((project) =>
                this.limit(async () => {
                    const projectHash = this.generateHash(project.block);
                    try {
                        await tx
                            .insert(projectsTable)
                            .values(project)
                            .onConflictDoUpdate({
                                target: [projectsTable.identifier],
                                set: { ...project, updated_at: now },
                            });

                        await this.updateCache(CACHE_TYPES.PROJECT, project.identifier, projectHash);
                    } catch (error) {
                        console.error(`Failed to insert/update project ${project.identifier}:`, error);
                        throw error;
                    }
                })
            );

            await Promise.all(insertTasks);
        });
        console.log(`Successfully inserted/updated ${projects.length} projects.`);
    }

    private async captureScreenshot(
        project: RawProject,
        identifier: string
    ): Promise<{ url: string | null; identifier: string }> {
        const fileName = `${SCREENSHOT.PREFIX}${identifier}${SCREENSHOT.EXTENSION}`;
        const filePath = path.join(process.cwd(), fileName);

        if (await this.hasRecentScreenshot(filePath)) {
            return { url: fileName, identifier };
        }

        try {
            await captureWebsite.file(project.link, filePath, SCREENSHOT.CAPTURE_OPTIONS);
            return { url: fileName, identifier };
        } catch (error) {
            console.error(`Failed to capture screenshot for ${project.link}`);
            return { url: null, identifier };
        }
    }

    private async hasRecentScreenshot(filePath: string): Promise<boolean> {
        if (!existsSync(filePath)) return false;
        const stats = await stat(filePath);
        return Date.now() - stats.mtimeMs < SCREENSHOT.CACHE_DURATION;
    }

    private getSeasonNumber(branch: string): number {
        return branch === 'main' ? 1 : parseInt(branch.split('-')[1], 10);
    }

    private generateHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    private generateProjectIdentifier(branch: string, order: number, date: Date): string {
        return `${branch}-${date.toISOString().split('T')[0]}-${order}`.replace(/-/g, '_');
    }

    private async updateCache(type: string, name: string, hash: string): Promise<void> {
        const now = new Date().toISOString();

        await db
            .insert(cacheTable)
            .values({ type: type, name, hash })
            .onConflictDoUpdate({
                target: [cacheTable.type, cacheTable.name],
                set: { hash, updated_at: now },
            });

        this.cache.set(`${type}:${name}`, { hash, updated_at: now });
    }

    private async getBranches(): Promise<string[]> {
        const { data } = await this.octokit.repos.listBranches({
            owner: config.GITHUB_REPO_OWNER,
            repo: config.GITHUB_REPO_NAME,
        });

        return data
            .map((branch) => branch.name)
            .filter((name) => name === 'main' || name.startsWith('season-'))
            .sort((a, b) => {
                if (a === 'main') return -1;
                if (b === 'main') return 1;
                return parseInt(a.split('-')[1], 10) - parseInt(b.split('-')[1], 10);
            });
    }

    private async getReadmeContent(branch: string): Promise<string | null> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: config.GITHUB_REPO_OWNER,
                repo: config.GITHUB_REPO_NAME,
                path: 'README.md',
                ref: branch,
            });
            return 'content' in data ? Buffer.from(data.content, 'base64').toString() : null;
        } catch (error) {
            console.error(`Failed to get README for branch ${branch}:`, error);
            return null;
        }
    }
}

export const scraper = new Scraper();
