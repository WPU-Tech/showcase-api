import { db } from '@/db';
import { cacheTable, CreateProject, projectsTable, SelectCache } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import captureWebsite from 'capture-website';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { parseMarkdownContent } from './markdown';
import { config } from './config';
import { Octokit } from '@octokit/rest';

class Scraper {
    private _isScraping = false;
    private readonly limit = pLimit(config.CONCURRENCY_LIMIT);
    private readonly octokit;

    get isScraping(): boolean {
        return this._isScraping;
    }

    constructor() {
        this.octokit = new Octokit({
            auth: config.GITHUB_TOKEN,
        });
    }

    async scrapeProject() {
        if (this._isScraping) {
            console.log('Scraping already in progress.');
            return;
        }
        this._isScraping = true;
        const projectCache = await db.select().from(cacheTable).where(eq(cacheTable.type, 'project'));

        try {
            const branches = await this.getBranches();
            for (const branch of branches) {
                const { branchProjects, contentHash } = await this.processBranch(branch, projectCache);
                if (branchProjects.length === 0 || !contentHash) {
                    console.log('No projects to insert.');
                    continue;
                }
                await this.insertProjects(branchProjects);
                await this.updateCache('branch', branch, contentHash);
            }
            console.log('Scraping completed successfully.');
        } catch (error) {
            console.error(`Scraping failed: ${(error as Error).message}`);
        } finally {
            this._isScraping = false;
        }
    }

    private async processBranch(
        branch: string,
        projectCache: SelectCache[]
    ): Promise<{ branchProjects: CreateProject[]; contentHash?: string }> {
        const content = await this.getReadmeContent(branch);
        if (!content) {
            console.warn(`No content found for branch: ${branch}`);
            return { branchProjects: [] };
        }

        const contentHash = this.generateHash(content);

        if (await this.checkCache('branch', branch, contentHash)) {
            console.log(`Cache hit for branch: ${branch}`);
            return { branchProjects: [] };
        }

        console.log(`Processing branch: ${branch}`);
        const seasonNumber = this.getSeasonNumber(branch);
        const weeks = parseMarkdownContent(content);
        const branchProjects: CreateProject[] = [];

        for (const week of weeks) {
            console.log(`Processing week: ${week.date.toLocaleDateString()}`);

            const screenshots = await Promise.all(
                week.projects.map((project) => this.limit(() => this.captureScreenshot(project, branch, week.date)))
            );

            for (const project of week.projects) {
                const projectHash = this.generateHash(project.block);
                const identifier = this.generateProjectIdentifier(branch, project.order, week.date);
                const isCached = projectCache.map((cache) => cache.name === identifier && cache.hash === projectHash);

                if (isCached.length > 0) continue;

                const formattedProjects = {
                    ...project,
                    season: seasonNumber,
                    branch,
                    date: week.date.toISOString(),
                    identifier,
                    screenshot: screenshots.find((s) => s.identifier === identifier)?.url,
                };

                branchProjects.push(formattedProjects);
            }
        }
        console.log(`Cache updated for branch: ${branch}`);

        return { branchProjects, contentHash };
    }

    private async insertProjects(projects: CreateProject[]): Promise<void> {
        console.log(`Inserting ${projects.length} projects into the database...`);
        await db.transaction(async (tx) => {
            const insertOrUpdate = async (project: CreateProject) => {
                try {
                    await tx
                        .insert(projectsTable)
                        .values(project)
                        .onConflictDoUpdate({
                            target: [projectsTable.identifier],
                            set: {
                                ...project,
                                updated_at: new Date().toISOString(),
                            },
                        });

                    await tx
                        .insert(cacheTable)
                        .values({ hash: this.generateHash(project.block) })
                        .onConflictDoUpdate({
                            target: [projectsTable.identifier],
                            set: {
                                ...project,
                                updated_at: new Date().toISOString(),
                            },
                        });
                } catch (error) {
                    console.error(`Failed to insert/update project ${project.identifier}: ${(error as Error).message}`);
                    throw error;
                }
            };

            const tasks = projects.map((project) => this.limit(() => insertOrUpdate(project)));
            await Promise.all(tasks);
        });
        console.log(`Successfully inserted/updated ${projects.length} projects.`);
    }

    private async captureScreenshot(
        project: { link: string; order: number },
        branch: string,
        weekDate: Date
    ): Promise<{
        url: string | null;
        identifier: string;
    }> {
        const identifier = this.generateProjectIdentifier(branch, project.order, weekDate);
        const fileName = `screenshots/${identifier}.webp`;
        const filePath = path.join(process.cwd(), fileName);

        if (await this.hasRecentScreenshot(filePath)) {
            return { url: `screenshots/${identifier}.webp`, identifier };
        }

        return await this.performScreenCapture(project.link, fileName, identifier);
    }

    private async hasRecentScreenshot(filePath: string): Promise<boolean> {
        if (!existsSync(filePath)) return false;

        const stats = await import('fs/promises').then((fs) => fs.stat(filePath));
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        return Date.now() - stats.mtimeMs < TWENTY_FOUR_HOURS;
    }

    private async performScreenCapture(
        url: string,
        fileName: string,
        identifier: string
    ): Promise<{ url: string | null; identifier: string }> {
        try {
            await captureWebsite.file(url, path.join(process.cwd(), fileName), {
                delay: 2,
                disableAnimations: true,
                type: 'webp',
                userAgent:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                styles: ['html, body { overflow: hidden !important; }'],
                overwrite: true,
                timeout: 10,
            });
            return { url: fileName, identifier };
        } catch (error) {
            console.error(`Failed to capture screenshot for ${identifier}: ${(error as Error).message}`);
            return { url: null, identifier };
        }
    }

    private getSeasonNumber(branch: string): number {
        return branch === 'main' ? 1 : parseInt(branch.split('-')[1]);
    }

    private generateHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    private generateProjectIdentifier(branch: string, order: number, date: Date): string {
        return `${branch}-${date.toISOString().split('T')[0]}-${order}`.replace(/-/g, '_');
    }

    private async checkCache(type: string, name: string, hash: string): Promise<boolean> {
        const cached = await db
            .select()
            .from(cacheTable)
            .where(and(eq(cacheTable.type, type), eq(cacheTable.name, name), eq(cacheTable.hash, hash)));
        return cached.length > 0;
    }

    private async updateCache(type: string, name: string, hash: string): Promise<void> {
        await db
            .insert(cacheTable)
            .values({ type, name, hash })
            .onConflictDoUpdate({
                target: [cacheTable.type, cacheTable.name],
                set: { hash },
            });
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
                return parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]);
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
            if ('content' in data) {
                return Buffer.from(data.content, 'base64').toString();
            }
            return null;
        } catch (error) {
            console.error(`Failed to get README for branch ${branch}:`, error);
            return null;
        }
    }
}

export const scraper = new Scraper();
