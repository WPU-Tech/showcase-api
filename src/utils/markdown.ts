import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

// Month names in Indonesian (kept in lowercase for case-insensitive comparison)
const INDONESIAN_MONTHS = [
    'januari',
    'februari',
    'maret',
    'april',
    'mei',
    'juni',
    'juli',
    'agustus',
    'september',
    'oktober',
    'november',
    'desember',
];

export interface RawProject {
    block: string;
    order: number;
    link: string;
    creator: string | null;
    description: string;
}

export interface RawWeek {
    date: Date;
    projects: RawProject[];
}

/**
 * Parse a date string in Indonesian format to Date object
 * @param dateStr - Date string in format "DD Month YYYY"
 * @returns Date object
 */
export function parseIndonesianDate(dateStr: string): Date {
    const [day, month, year] = dateStr.toLowerCase().split(' ');
    const monthIndex = INDONESIAN_MONTHS.indexOf(month);
    if (monthIndex === -1) throw new Error(`Invalid month: ${month}`);
    return new Date(parseInt(year), monthIndex, parseInt(day));
}

/**
 * Parse markdown content and extract weeks with their projects
 * @param content - Markdown content to parse
 * @returns Array of weeks with their projects
 */
export function parseMarkdownContent(content: string): RawWeek[] {
    const weeks: RawWeek[] = [];
    const weekBlocks = content.split(/### \d{1,2} \w+ \d{4}/);
    const dateMatches = content.match(/### (\d{1,2} \w+ \d{4})/g) || [];

    weekBlocks.shift(); // Remove content before first date

    dateMatches.forEach((dateStr, index) => {
        const date = parseIndonesianDate(dateStr.replace('### ', ''));
        const weekContent = weekBlocks[index];
        const projects = extractProjects(weekContent);

        if (projects.length > 0) {
            weeks.push({ date, projects });
        }
    });

    return weeks;
}

/**
 * Extract projects from a week's content
 * @param weekContent - Content of a single week section
 * @returns Array of parsed projects
 */
function extractProjects(weekContent: string): RawProject[] {
    const projects: RawProject[] = [];
    const projectBlocks = weekContent.split(/\n(?=\d+\.\s+\[)/); // pisah antar project

    for (const block of projectBlocks) {
        const lines = block.trim().split('\n');
        const orderMatch = lines[0].match(/^(\d+)\.\s+\[(.*?)\]/);

        if (!orderMatch) continue;

        const order = parseInt(orderMatch[1]);
        const link = orderMatch[2].trim();

        let creator = null;
        let descriptionLines = [];
        let extraLinks = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!creator && /\*\*(.+?)\*\*/.test(line)) {
                creator = line.match(/\*\*(.+?)\*\*/)?.[1].trim() ?? null;
                continue;
            }

            if (/^\[https?:\/\/.*\]$/.test(line)) {
                extraLinks.push(line.slice(1, -1));
            } else {
                descriptionLines.push(line);
            }
        }

        const combinedDescription = [...extraLinks.map((url) => url), ...descriptionLines].join('\n');

        projects.push({
            order,
            link,
            creator: creator ? creator.trim() : null,
            description: formatMarkdown(combinedDescription.trim()),
            block,
        });
    }

    return projects.sort((a, b) => a.order - b.order);
}

/**
 * Format and sanitize markdown content
 * @param markdown - Raw markdown content
 * @returns Sanitized HTML string
 */
function formatMarkdown(markdown: string): string {
    const cleanMarkdown = markdown
        .split('\n')
        .map((line) => line.trim())
        .join('\n');

    return DOMPurify.sanitize((marked.parse(cleanMarkdown) as string).replace(/<br\/?>/gi, ''));
}
