"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import TaskRow from "@/components/TaskRow";
import {
  addList,
  addTask,
  deleteTask,
  renameList,
  renameTask,
  resetChecklist,
  setListArchived,
  setTaskDay,
  setTaskDone,
  type TaskResult,
} from "@/app/day/[date]/task-actions";
import { localStartOfDay, toDateParam } from "@/lib/dates";
import { groupTasks, type OptimisticAction } from "@/lib/tasks";
import type { ListKind, Task, TaskList } from "@/lib/types";

type Props = {
  dayParam: string;
  lists: TaskList[];
  /** Already carries any pending optimistic edits — DayView owns that state. */
  tasks: Task[];
  applyOptimistic: (action: OptimisticAction) => void;
  loadError: string | null;
};

export default function TaskPanel({
  dayParam,
  lists,
  tasks,
  applyOptimistic,
  loadError,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mutate(action: OptimisticAction, run: () => Promise<TaskResult>) {
    startTransition(async () => {
      applyOptimistic(action);
      const result = await run();
      setError(result.ok ? null : result.error);
      // Pull fresh rows inside the same transition so the optimistic value
      // stays put until the real one is ready to replace it.
      router.refresh();
    });
  }

  const listNames = useMemo(
    () => new Map(lists.map((l) => [l.id, l.name])),
    [lists],
  );

  const activeLists = useMemo(() => lists.filter((l) => !l.archived), [lists]);
  const archivedLists = useMemo(() => lists.filter((l) => l.archived), [lists]);

  // Grouped against the active lists only, so an archived list's tasks are held
  // back rather than spilling into the backlog.
  const { today, backlog, byList } = useMemo(
    () => groupTasks(tasks, activeLists, dayParam),
    [tasks, activeLists, dayParam],
  );

  /** Open-item counts for archived lists, shown before you restore one. */
  const archivedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.list_id && !task.done) {
        counts.set(task.list_id, (counts.get(task.list_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const isToday = toDateParam(new Date()) === dayParam;
  const dayLabel = isToday
    ? "Today"
    : format(localStartOfDay(dayParam), "EEE d MMM");

  // ---- shared row handlers -------------------------------------------------
  function rowHandlers(task: Task) {
    return {
      onToggle: (done: boolean) =>
        mutate({ type: "toggle", id: task.id, done }, () =>
          setTaskDone(task.id, done),
        ),
      onRename: (title: string) =>
        mutate({ type: "rename", id: task.id, title }, () =>
          renameTask(task.id, title),
        ),
      onDelete: () =>
        mutate({ type: "delete", id: task.id }, () => deleteTask(task.id)),
    };
  }

  function pinHandler(task: Task) {
    const next = task.day === dayParam ? null : dayParam;
    return () =>
      mutate({ type: "setDay", id: task.id, day: next }, () =>
        setTaskDay(task.id, next),
      );
  }

  function add(listId: string | null, day: string | null) {
    return (title: string) =>
      mutate(
        {
          type: "add",
          task: {
            id: `optimistic-${crypto.randomUUID()}`,
            list_id: listId,
            title,
            done: false,
            day,
            // Sorts to the end next to the real row's appended position.
            position: Date.now(),
          },
        },
        () => addTask({ title, listId, day }),
      );
  }

  /**
   * Lists aren't in the optimistic layer — they change rarely, and a refresh is
   * quick enough that a briefly stale list header isn't worth the machinery.
   */
  function setArchived(listId: string, archived: boolean) {
    startTransition(async () => {
      const result = await setListArchived(listId, archived);
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {(loadError || error) && (
        <p
          role="alert"
          className="bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
        >
          {loadError ?? error}
        </p>
      )}

      {/* ---- pinned to this day ---------------------------------------- */}
      <section className="border-b border-line px-3 py-3">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {dayLabel}
          {today.length > 0 && (
            <span className="ml-1.5 font-normal normal-case">
              {today.filter((t) => !t.done).length} left
            </span>
          )}
        </h2>

        {today.length === 0 ? (
          <p className="px-1 py-1 text-sm text-muted">
            Nothing pinned to this day.
          </p>
        ) : (
          <ul>
            {today.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                listName={
                  task.list_id ? listNames.get(task.list_id) : undefined
                }
                pinDay={dayParam}
                onTogglePin={pinHandler(task)}
                {...rowHandlers(task)}
              />
            ))}
          </ul>
        )}

        <QuickAdd
          placeholder={`Add for ${dayLabel.toLowerCase()}`}
          onAdd={add(null, dayParam)}
        />
      </section>

      {/* ---- free-form backlog ----------------------------------------- */}
      <section className="border-b border-line px-3 py-3">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          To-do
        </h2>
        {backlog.length > 0 && (
          <ul>
            {backlog.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                pinDay={dayParam}
                onTogglePin={pinHandler(task)}
                {...rowHandlers(task)}
              />
            ))}
          </ul>
        )}
        <QuickAdd placeholder="Add a to-do" onAdd={add(null, null)} />
      </section>

      {/* ---- user lists ------------------------------------------------ */}
      {activeLists.map((list) => (
        <ListSection
          key={list.id}
          list={list}
          tasks={byList.get(list.id) ?? []}
          dayParam={dayParam}
          rowHandlers={rowHandlers}
          pinHandler={pinHandler}
          onAdd={add(list.id, null)}
          onReset={() =>
            mutate({ type: "resetList", listId: list.id }, () =>
              resetChecklist(list.id),
            )
          }
          onRename={(name) =>
            startTransition(async () => {
              const result = await renameList(list.id, name);
              setError(result.ok ? null : result.error);
              router.refresh();
            })
          }
          onArchive={() => setArchived(list.id, true)}
        />
      ))}

      {archivedLists.length > 0 && (
        <section className="border-b border-line px-3 py-3">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Archived
          </h2>
          <ul>
            {archivedLists.map((list) => (
              <li
                key={list.id}
                className="flex items-center gap-2 rounded-md px-1 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {list.name}
                  {(archivedCounts.get(list.id) ?? 0) > 0 && (
                    <span className="ml-1.5 text-[11px]">
                      {archivedCounts.get(list.id)} open
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setArchived(list.id, false)}
                  className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-ink"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewList
        onCreate={(name, kind) =>
          startTransition(async () => {
            const result = await addList(name, kind);
            setError(result.ok ? null : result.error);
            router.refresh();
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuickAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        // Clear but keep focus, so several items can be typed in a row.
        setValue("");
      }}
      className="mt-0.5 flex items-center gap-2 px-1"
    >
      <span aria-hidden className="text-muted">
        +
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
      />
    </form>
  );
}

function ListSection({
  list,
  tasks,
  dayParam,
  rowHandlers,
  pinHandler,
  onAdd,
  onReset,
  onRename,
  onArchive,
}: {
  list: TaskList;
  tasks: Task[];
  dayParam: string;
  rowHandlers: (task: Task) => {
    onToggle: (done: boolean) => void;
    onRename: (title: string) => void;
    onDelete: () => void;
  };
  pinHandler: (task: Task) => () => void;
  onAdd: (title: string) => void;
  onReset: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  // Seeded when renaming starts, so it can never hold a stale name (same
  // reasoning as TaskRow).
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  function startRenaming() {
    setDraft(list.name);
    setRenaming(true);
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const openCount = tasks.length - doneCount;

  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-1 flex items-center gap-2">
        {renaming ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              const trimmed = draft.trim();
              if (trimmed && trimmed !== list.name) onRename(trimmed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide outline-none"
          />
        ) : (
          // A heading, so each list is a real landmark in the document outline
          // alongside Today and To-do — not just a styled button.
          <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <button
              type="button"
              onClick={startRenaming}
              title="Rename list"
              className="w-full truncate text-left"
            >
              {list.name}
              {openCount > 0 && (
                <span className="ml-1.5 font-normal normal-case">
                  {openCount} left
                </span>
              )}
            </button>
          </h2>
        )}

        {list.kind === "checklist" && doneCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            title="Untick every item"
            className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-ink"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onArchive}
          title="Archive list — its items are kept and it can be restored"
          aria-label={`Archive ${list.name}`}
          className="shrink-0 rounded px-1 text-muted hover:text-rose-600 dark:hover:text-rose-400"
        >
          ×
        </button>
      </div>

      {tasks.length > 0 && (
        <ul>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              pinDay={dayParam}
              onTogglePin={pinHandler(task)}
              {...rowHandlers(task)}
            />
          ))}
        </ul>
      )}

      <QuickAdd placeholder={`Add to ${list.name}`} onAdd={onAdd} />
    </section>
  );
}

function NewList({
  onCreate,
}: {
  onCreate: (name: string, kind: ListKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ListKind>("checklist");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-3 text-left text-sm text-muted hover:text-ink"
      >
        + New list
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed, kind);
        setName("");
        setOpen(false);
      }}
      className="px-3 py-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        aria-label="List name"
        autoFocus
        className="w-full rounded-lg border border-line-strong bg-canvas px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        {(
          [
            ["checklist", "Checklist"],
            ["todo", "To-do"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`rounded-lg border px-2 py-1 text-xs ${
              kind === value
                ? "border-accent text-accent"
                : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="submit"
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName("");
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
