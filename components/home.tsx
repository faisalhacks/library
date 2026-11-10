"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useWorkspace } from "@/lib/workspace";
import { displayName, noteHref } from "./use-actions";
import { FileTypeIcon, NoteTypeIcon } from "./item-icon";
import LocalTime from "./local-time";
import RelativeTime from "./relative-time";
import { STATUSES, formatDue, isOverdue, useTasks } from "./use-tasks";

export default function Home() {
  const { user, files, notes, folderById, openPreview } = useWorkspace();
  const { tasks, error, updateTask } = useTasks();

  const recentFiles = files.slice(0, 6);
  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
    [notes]
  );
  const openTasks = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) => t.status !== "done" && (t.assignee === user.id || t.assignee === null)
      ),
    [tasks, user.id]
  );

  return (
    <>
      <div className="page-head">
        <h1>Hello, {displayName(user.email)}</h1>
      </div>

      <div className="home-grid">
        <section className="panel">
          <h2>
            Recent files
            <Link className="home-all" href="/files">
              View all
            </Link>
          </h2>
          {recentFiles.length === 0 ? (
            <div className="state">
              <strong>No files yet</strong>
              <p>
                Go to <Link href="/files">Files</Link> to upload your first one.
              </p>
            </div>
          ) : (
            <ul className="rows">
              {recentFiles.map((file) => {
                const folder = file.folder_id ? folderById.get(file.folder_id) : null;
                return (
                  <li key={file.id}>
                    <button className="row-button" onClick={() => openPreview(file)}>
                      <FileTypeIcon name={file.name} contentType={file.content_type} small />
                      <span className="home-text">
                        <span className="row-name">{file.name}</span>
                        <span className="row-meta">
                          {displayName(file.uploader_email)} · <LocalTime iso={file.created_at} />
                          {folder && <span className="muted home-folder"> · in {folder.name}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>
            Recently edited notes
            <Link className="home-all" href="/files">
              View all
            </Link>
          </h2>
          {recentNotes.length === 0 ? (
            <div className="state">
              <strong>No notes yet</strong>
              <p>
                Go to <Link href="/files">Files</Link> to write your first note.
              </p>
            </div>
          ) : (
            <ul className="rows">
              {recentNotes.map((note) => (
                <li key={note.id}>
                  <Link className="row-button" href={noteHref(note.id)}>
                    <NoteTypeIcon small />
                    <span className="home-text">
                      <span className="row-name">{note.title || "Untitled"}</span>
                      <span className="row-meta">
                        edited by {note.updated_by === user.email ? "you" : displayName(note.updated_by)},{" "}
                        <RelativeTime iso={note.updated_at} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel home-tasks">
          <h2>
            My open tasks
            <Link className="home-all" href="/tracker">
              View all
            </Link>
          </h2>
          {error ? (
            <div className="state">
              <strong>Could not load tasks</strong>
              <p>{error}</p>
            </div>
          ) : tasks === null ? (
            <div className="home-skeletons" aria-label="Loading tasks">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton home-skeleton" />
              ))}
            </div>
          ) : openTasks.length === 0 ? (
            <div className="state">
              <strong>No open tasks. Nice.</strong>
              <p>
                Add one in the <Link href="/tracker">Tracker</Link>.
              </p>
            </div>
          ) : (
            <ul className="rows">
              {openTasks.slice(0, 8).map((task) => {
                const overdue = isOverdue(task);
                const status = STATUSES.find((s) => s.value === task.status)?.label ?? task.status;
                return (
                  <li key={task.id} className="home-task">
                    <input
                      type="checkbox"
                      className="home-check"
                      checked={false}
                      onChange={() => updateTask(task.id, { status: "done" })}
                      aria-label={`Mark done: ${task.title}`}
                      title="Mark done"
                    />
                    <span className="row-name">{task.title}</span>
                    <span className="chip">{status}</span>
                    {task.due_date && (
                      <span className={`row-meta${overdue ? " home-overdue" : ""}`}>
                        {overdue ? "Overdue · " : "Due "}
                        {formatDue(task.due_date)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
