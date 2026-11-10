"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useDialogs } from "./dialogs";
import Menu from "./menu";
import { displayName } from "./use-actions";
import { usePref } from "./use-pref";
import { STATUSES, formatDue, isOverdue, useTasks, type Task, type TaskStatus } from "./use-tasks";

const FILTERS = ["mine", "all"] as const;

export default function Tracker() {
  const { user, members } = useWorkspace();
  const { ask, confirm } = useDialogs();
  const { tasks, error, live, addTask, updateTask, deleteTask } = useTasks();
  const [filter, setFilter] = usePref("tracker-filter", "all", FILTERS);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = (tasks ?? []).filter(
    (t) => filter === "all" || t.assignee === user.id || t.assignee === null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await addTask({ title, assignee: assignee || null, due_date: due || null });
    setBusy(false);
    if (ok) {
      setTitle("");
      setAssignee("");
      setDue("");
    }
  }

  async function rename(task: Task) {
    const next = await ask({ title: "Rename task", label: "Title", initial: task.title, okLabel: "Rename" });
    if (next && next.trim() && next.trim() !== task.title) updateTask(task.id, { title: next.trim() });
  }

  async function remove(task: Task) {
    const ok = await confirm({
      title: "Delete task?",
      message: `"${task.title}" will be deleted for both of you.`,
      okLabel: "Delete",
      danger: true,
    });
    if (ok) deleteTask(task.id);
  }

  const assigneeOptions = (
    <>
      <option value="">Both</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {displayName(m.email)}
          {m.id === user.id ? " (you)" : ""}
        </option>
      ))}
    </>
  );

  return (
    <>
      <div className="page-head">
        <h1>Tracker</h1>
        <div className="toolbar">
          <span className={`tracker-live${live ? " on" : ""}`} role="status">
            <span className="tracker-dot" aria-hidden="true" />
            {live ? "Live" : "Connecting…"}
          </span>
          <div className="segmented" role="group" aria-label="Filter tasks">
            <button className={filter === "mine" ? "on" : ""} aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>
              Mine
            </button>
            <button className={filter === "all" ? "on" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All
            </button>
          </div>
        </div>
      </div>

      <form className="tracker-add" onSubmit={submit}>
        <input
          type="text"
          className="tracker-add-title"
          placeholder="Add a task…"
          aria-label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {assigneeOptions}
        </select>
        <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="submit" className="primary" disabled={!title.trim() || busy}>
          Add
        </button>
      </form>

      {error ? (
        <div className="state">
          <strong>Could not load tasks</strong>
          <p className="error">{error}</p>
        </div>
      ) : tasks === null ? (
        <div className="tracker-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton tracker-skeleton" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="state">
          <strong>{filter === "mine" ? "Nothing assigned to you" : "No tasks yet"}</strong>
          <p>{filter === "mine" ? "Tasks for you or for both of you show up here." : "Add the first task above."}</p>
        </div>
      ) : (
        STATUSES.map((s) => {
          const group = visible.filter((t) => t.status === s.value);
          return (
            <section key={s.value} className="tracker-group">
              <h2 className="tracker-group-title">
                {s.label} <span className="muted">{group.length}</span>
              </h2>
              {group.length === 0 ? (
                <p className="muted tracker-none">Nothing here</p>
              ) : (
                <ul className="tracker-list">
                  {group.map((task) => {
                    const overdue = isOverdue(task);
                    return (
                      <li key={task.id} className={`tracker-row${task.status === "done" ? " done" : ""}`}>
                        <select
                          className="tracker-status"
                          aria-label={`Status of ${task.title}`}
                          value={task.status}
                          onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
                        >
                          {STATUSES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span className="tracker-title">{task.title}</span>
                        <div className="tracker-meta">
                          <select
                            aria-label={`Assignee of ${task.title}`}
                            value={task.assignee ?? ""}
                            onChange={(e) => updateTask(task.id, { assignee: e.target.value || null })}
                          >
                            {assigneeOptions}
                          </select>
                          <span className={`tracker-due${overdue ? " overdue" : ""}`}>
                            {task.due_date && (
                              <span>
                                {overdue ? "Overdue " : "Due "}
                                {formatDue(task.due_date)}
                              </span>
                            )}
                            <input
                              type="date"
                              aria-label={`Due date of ${task.title}`}
                              value={task.due_date ?? ""}
                              onChange={(e) => updateTask(task.id, { due_date: e.target.value || null })}
                            />
                          </span>
                        </div>
                        <Menu
                          label="Task actions"
                          items={[
                            { label: "Rename", onSelect: () => rename(task) },
                            { label: "Delete", danger: true, onSelect: () => remove(task) },
                          ]}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
