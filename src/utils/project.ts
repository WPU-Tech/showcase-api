import { SelectProject } from '@/db/schema';

export const transformProjects = (dataArray: SelectProject[]) => {
    const weekMap: Map<string, SelectProject[]> = new Map();

    for (const project of dataArray) {
        const { date } = project;
        if (!weekMap.has(date)) {
            weekMap.set(date, []);
        }
        weekMap.get(date)!.push(project);
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
        links: new Set<string>(),
        seasonStats: new Map<number, number>(),
        earliestDate: null as string | null,
        latestDate: null as string | null,
    };

    for (const project of projects) {
        stats.creators.add(project.creator?.trim().toLowerCase() || '');
        stats.links.add(project.link?.trim().toLowerCase() || '');

        stats.seasonStats.set(project.season, (stats.seasonStats.get(project.season) || 0) + 1);

        if (!stats.earliestDate || project.date < stats.earliestDate) {
            stats.earliestDate = project.date;
        }
        if (!stats.latestDate || project.date > stats.latestDate) {
            stats.latestDate = project.date;
        }
    }

    return {
        totalProjects: stats.totalProjects,
        totalSeasons: stats.seasonStats.size,
        creators: [...stats.creators].filter(Boolean),
        links: [...stats.links].filter(Boolean),
        seasonStats: [...stats.seasonStats.entries()].map(([season, count]) => ({ season, count })),
        earliestDate: stats.earliestDate,
        latestDate: stats.latestDate,
    };
};
