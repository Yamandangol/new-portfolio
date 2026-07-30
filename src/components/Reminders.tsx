"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { format } from "date-fns";
import type { EventOccurrence } from "@/lib/recurrence";

type Props = {
  /** Occurrences for the day being shown. */
  occurrences: EventOccurrence[];
};

/**
 * Reminders while the app is open.
 *
 * Scope, deliberately: this fires only when a tab is running. Notifying with the
 * app closed needs a service worker, a push subscription, VAPID keys and a
 * scheduled server job to send the pushes — real infrastructure with a running
 * cost, against a brief asking for near-zero cost and low maintenance. The
 * honest version is this one, plus a clear note that it isn't background push.
 *
 * A 30-second poll is used rather than one setTimeout per event: long timers
 * drift, and browsers throttle or drop them in a backgrounded tab.
 */
const POLL_MS = 30_000;
/** Don't fire for anything that came due longer ago than this. */
const STALE_AFTER_MS = 5 * 60_000;

type Toast = { id: string; title: string; when: string };

/**
 * Notification.permission read through an external store rather than
 * state-set-in-an-effect. It also fixes hydration: the server has no
 * Notification API, so the server snapshot reports "unsupported" and React
 * re-reads on the client without a mismatch.
 */
type PermissionState = NotificationPermission | "unsupported";

let permissionListeners: (() => void)[] = [];

function subscribePermission(onChange: () => void) {
  permissionListeners.push(onChange);
  return () => {
    permissionListeners = permissionListeners.filter((l) => l !== onChange);
  };
}

function notifyPermissionChanged() {
  for (const listener of permissionListeners) listener();
}

function readPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

const readPermissionOnServer = (): PermissionState => "unsupported";

function firedStorageKey(day: string) {
  return `reminders-fired:${day}`;
}

function loadFired(day: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(firedStorageKey(day));
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistFired(day: string, fired: Set<string>) {
  try {
    window.localStorage.setItem(
      firedStorageKey(day),
      JSON.stringify([...fired]),
    );
    // Keep only the current day's record around.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (
        key?.startsWith("reminders-fired:") &&
        key !== firedStorageKey(day)
      ) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Private mode or a full quota — reminders still work for this session.
  }
}

export default function Reminders({ occurrences }: Props) {
  const permission = useSyncExternalStore(
    subscribePermission,
    readPermission,
    readPermissionOnServer,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const firedRef = useRef<Set<string>>(new Set());

  const check = useCallback(() => {
    const now = Date.now();

    for (const occurrence of occurrences) {
      const minutes = occurrence.reminder_minutes_before;
      if (minutes === null || minutes === undefined) continue;

      const dueAt =
        new Date(occurrence.starts_at).getTime() - minutes * 60_000;
      if (dueAt > now) continue;
      // Opening the app long after the fact shouldn't replay old reminders.
      if (now - dueAt > STALE_AFTER_MS) continue;

      const day = occurrence.occurrenceDay;
      if (firedRef.current.size === 0) firedRef.current = loadFired(day);
      if (firedRef.current.has(occurrence.id)) continue;

      firedRef.current.add(occurrence.id);
      persistFired(day, firedRef.current);

      const when = format(new Date(occurrence.starts_at), "HH:mm");
      const body =
        minutes === 0 ? `Starting now · ${when}` : `In ${minutes} min · ${when}`;

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(occurrence.title, { body, tag: occurrence.id });
        } catch {
          // Some browsers only allow notifications from a service worker;
          // the in-page toast below still shows.
        }
      }

      setToasts((prev) => [
        ...prev,
        { id: occurrence.id, title: occurrence.title, when: body },
      ]);
    }
  }, [occurrences]);

  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const hasReminders = occurrences.some(
    (o) => o.reminder_minutes_before !== null,
  );

  return (
    <>
      {hasReminders && permission === "default" && (
        <div className="shrink-0 border-b border-line bg-accent/10 px-3 py-2 text-xs sm:px-4">
          <span className="text-muted">
            Reminders show here while the app is open.
          </span>{" "}
          <button
            type="button"
            onClick={async () => {
              await Notification.requestPermission();
              notifyPermissionChanged();
            }}
            className="font-medium text-accent underline"
          >
            Also notify me
          </button>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{toast.title}</p>
                <p className="text-xs text-muted">{toast.when}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                }
                aria-label="Dismiss reminder"
                className="-m-1 p-1 text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
