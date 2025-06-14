import { SelectProject } from '@/db/schema';

export const transformProjects = (dataArray: SelectProject[]) => {
    const weekMap: Map<string, SelectProject[]> = new Map();

    for (const project of dataArray) {
        const { date } = project;
        if (!weekMap.has(date.toISOString())) {
            weekMap.set(date.toISOString(), []);
        }
        weekMap.get(date.toISOString())!.push(project);
    }

    const weeks = [...weekMap.entries()]
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([date, projects]) => ({ date, projects }));

    return {
        season: dataArray[0].season,
        weeks,
        count: dataArray.length,
    };
};

export const getMetadata = (projects: SelectProject[]) => {
    const stats = {
        totalProjects: projects.length,
        creators: new Set<string>(),
        episodes: new Set<string>(),
        links: new Set<string>(),
        seasonStats: new Map<number, number>(),
        earliestDate: null as Date | null,
        latestDate: null as Date | null,
    };

    for (const project of projects) {
        stats.creators.add(project.creator?.trim().toLowerCase() || '');
        stats.links.add(project.link?.trim().toLowerCase() || '');
        stats.episodes.add(project.date.toISOString());

        stats.seasonStats.set(project.season, (stats.seasonStats.get(project.season) || 0) + 1);

        const dateAsDate = new Date(project.date);
        if (!stats.earliestDate || dateAsDate < stats.earliestDate) {
            stats.earliestDate = dateAsDate;
        }
        if (!stats.latestDate || dateAsDate > stats.latestDate) {
            stats.latestDate = dateAsDate;
        }
    }

    return {
        totalProjects: stats.totalProjects,
        totalSeasons: stats.seasonStats.size,
        creators: [...stats.creators],
        links: [...stats.links],
        episodes: [...stats.episodes],
        seasonStats: [...stats.seasonStats.entries()].map(([season, count]) => ({ season, count })),
        earliestDate: stats.earliestDate,
        latestDate: stats.latestDate,
    };
};
