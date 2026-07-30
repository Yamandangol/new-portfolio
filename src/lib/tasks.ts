import type { Task, TaskList } from "@/lib/types";

/**
 * Local edits applied ahead of the server round-trip. Ticking a checkbox has to
 * feel instant, so the panel reduces one of these immediately and lets the
 * refreshed server rows replace it afterwards.
 */
export type OptimisticAction =
  | { type: "add"; task: Task }
  | { type: "toggle"; id: string; done: boolean }
  | { type: "rename"; id: string; title: string }
  | { type: "delete"; id: string }
  | { type: "setDay"; id: string; day: string | null }
  | { type: "resetList"; listId: string };

export function reduceTasks(tasks: Task[], action: OptimisticAction): Task[] {
  switch (action.type) {
    case "add":
      return [...tasks, action.task];
    case "toggle":
      return tasks.map((t) =>
        t.id === action.id ? { ...t, done: action.done } : t,
      );
    case "rename":
      return tasks.map((t) =>
        t.id === action.id ? { ...t, title: action.title } : t,
      );
    case "delete":
      return tasks.filter((t) => t.id !== action.id);
    case "setDay":
      return tasks.map((t) =>
        t.id === action.id ? { ...t, day: action.day } : t,
      );
    case "resetList":
      // Mirrors resetChecklist, which only touches rows in this list.
      return tasks.map((t) =>
        t.list_id === action.listId ? { ...t, done: false } : t,
      );
  }
}

/** Open items first, then completed ones; each group in manual order. */
export function orderTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => Number(a.done) - Number(b.done) || a.position - b.position,
  );
}

export type GroupedTasks = {
  /** Pinned to the day being viewed, whatever list they also belong to. */
  today: Task[];
  /** Free-form to-dos: in no list and pinned to no day. */
  backlog: Task[];
  /** Every task of each list, keyed by list id. */
  byList: Map<string, Task[]>;
};

/**
 * Split tasks into the panel's sections.
 *
 * A task pinned to the day *and* filed under a list deliberately appears in
 * both Today and that list — the same task showing in two views is the
 * behaviour to expect, not double-counting.
 */
export function groupTasks(
  tasks: Task[],
  lists: TaskList[],
  dayParam: string,
): GroupedTasks {
  const byList = new Map<string, Task[]>(lists.map((l) => [l.id, []]));

  for (const task of tasks) {
    // Tasks belonging to an archived list have no section to appear in, so
    // they're skipped rather than leaking into the backlog.
    if (task.list_id && byList.has(task.list_id)) {
      byList.get(task.list_id)!.push(task);
    }
  }

  return {
    today: orderTasks(tasks.filter((t) => t.day === dayParam)),
    backlog: orderTasks(
      tasks.filter((t) => t.list_id === null && t.day === null),
    ),
    byList: new Map(
      [...byList].map(([id, group]) => [id, orderTasks(group)]),
    ),
  };
}
