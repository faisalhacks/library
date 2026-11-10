"use client";

// Loads the tasks list and keeps it live with Supabase Realtime: when the other
// person adds, changes or deletes a task, it shows up here immediately.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace";

export type TaskStatus = "todo" | "doing" | "done";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string | null; // user id; null = both of us
  due_date: string | null; // "YYYY-MM-DD"
  created_at: string;
};

export const TASK_COLUMNS = "id, title, status, assignee, due_date, created_at";
export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

// Today's date in the viewer's time zone, as "YYYY-MM-DD".
export function today() {
  return new Date().toLocaleDateString("en-CA");
}

export function isOverdue(task: Task) {
  return task.status !== "done" && !!task.due_date && task.due_date < today();
}

export function formatDue(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Due date first (soonest at the top, no date last), then oldest first.
export function compareTasks(a: Task, b: Task) {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  }
  return a.created_at.localeCompare(b.created_at);
}

export function useTasks() {
  const { supabase, notify } = useWorkspace();
  const [tasks, setTasks] = useState<Task[] | null>(null); // null = still loading
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const upsert = useCallback((task: Task) => {
    setTasks((list) => {
      const rest = (list ?? []).filter((t) => t.id !== task.id);
      return [...rest, task];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((list) => (list ?? []).filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .returns<Task[]>()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setTasks(data ?? []);
      });

    const channel = supabase.channel(`tasks-${crypto.randomUUID()}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      (payload) => {
        if (payload.eventType === "DELETE") remove((payload.old as { id: string }).id);
        else upsert(payload.new as Task);
      }
    );
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, upsert, remove]);

  // Changes apply locally right away; Realtime then tells the other person.
  const addTask = useCallback(
    async (fields: { title: string; assignee: string | null; due_date: string | null }) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...fields, title: fields.title.trim() })
        .select(TASK_COLUMNS)
        .single<Task>();
      if (error || !data) {
        notify(error?.message ?? "Could not add task", "error");
        return false;
      }
      upsert(data);
      return true;
    },
    [supabase, notify, upsert]
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Pick<Task, "title" | "status" | "assignee" | "due_date">>) => {
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select(TASK_COLUMNS)
        .single<Task>();
      if (error || !data) {
        notify(error?.message ?? "Could not update task", "error");
        return false;
      }
      upsert(data);
      return true;
    },
    [supabase, notify, upsert]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        notify(error.message, "error");
        return false;
      }
      remove(id);
      return true;
    },
    [supabase, notify, remove]
  );

  const sorted = useMemo(() => (tasks ? [...tasks].sort(compareTasks) : null), [tasks]);

  return { tasks: sorted, error, live, addTask, updateTask, deleteTask };
}
