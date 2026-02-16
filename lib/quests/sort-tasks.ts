/**
 * Sorts quest tasks by order_index, then created_at, then id for deterministic ordering.
 * Centralised helper used by all quest API routes and UI components.
 */
export function sortQuestTasks<T extends { quest_tasks?: any[] }>(quest: T): T {
    const tasks = Array.isArray(quest?.quest_tasks) ? [...quest.quest_tasks] : [];
    tasks.sort(
        (a, b) =>
            (a?.order_index ?? Number.MAX_SAFE_INTEGER) -
            (b?.order_index ?? Number.MAX_SAFE_INTEGER) ||
            String(a?.created_at || "").localeCompare(String(b?.created_at || "")) ||
            String(a?.id || "").localeCompare(String(b?.id || "")),
    );

    return {
        ...quest,
        quest_tasks: tasks,
    };
}
