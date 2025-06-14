import { Octokit } from '@octokit/rest';
import { config } from './config';

const octokit = new Octokit({ auth: config.GITHUB_TOKEN });

export const getBranches = async (): Promise<string[]> => {
    const { data } = await octokit.repos.listBranches({
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
};

export const getReadmeContent = async (branch: string): Promise<string | null> => {
    try {
        const { data } = await octokit.repos.getContent({
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
};

export const getSeasonNumber = (branch: string) => (branch === 'main' ? 1 : parseInt(branch.split('-')[1], 10));
