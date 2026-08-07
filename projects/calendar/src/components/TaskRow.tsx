"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";

type Props = {
  task: Task;
  /** Name of the list this task belongs to, shown as context in Today. */
  listName?: string;
  /** When set, offers a pin toggle for this day. */
  pinDay?: string;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onTogglePin?: () => void;
};

export default function TaskRow({
  task,
  listName,
  pinDay,
  onToggle,
  onRename,
  onDelete,
  onTogglePin,
}: Props) {
  // `draft` only exists while editing, and is seeded from the task at the moment
  // editing starts — so there is nothing to keep in sync with incoming props.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEditing() {
    setDraft(task.title);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    // Clearing the field is a cancel, not a delete.
    if (trimmed && trimmed !== task.title) onRename(trimmed);
  }

  const pinned = pinDay !== undefined && task.day === pinDay;

  return (
    <li className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-canvas">
      <input
        type="checkbox"
        checked={task.done}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={task.done ? `Untick ${task.title}` : `Tick ${task.title}`}
        // size-4 alone renders a tiny native box on some platforms; accent-color
        // keeps it on-theme without a custom control.
        className="size-4 shrink-0 accent-[var(--color-accent)]"
      />

      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={`min-w-0 flex-1 truncate text-left text-sm ${
            task.done ? "text-muted line-through" : ""
          }`}
        >
          {task.title}
          {listName && (
            <span className="ml-1.5 text-[11px] text-muted">{listName}</span>
          )}
        </button>
      )}

      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          title={pinned ? "Unpin from this day" : "Pin to this day"}
          aria-label={pinned ? "Unpin from this day" : "Pin to this day"}
          className={`shrink-0 rounded p-1 ${
            pinned ? "text-accent" : "text-muted hover:text-ink"
          }`}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <rect
              x="2"
              y="3"
              width="12"
              height="11"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.5" />
            {pinned ? (
              <path
                d="M5.5 10l1.8 1.8L10.8 8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M8 8.5v3.5M6.25 10.25h3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${task.title}`}
        title="Delete"
        className="shrink-0 rounded px-1 text-muted hover:text-rose-600 dark:hover:text-rose-400"
      >
        ×
      </button>
    </li>
  );
}
