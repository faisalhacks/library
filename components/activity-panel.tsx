"use client";

import { useWorkspace } from "@/lib/workspace";
import { CloseIcon } from "./icons";

// Bottom-right stack of progress bars (uploads, zips) and short messages.
export default function ActivityPanel() {
  const { activity, dismissActivity } = useWorkspace();
  if (activity.length === 0) return null;

  return (
    <div className="activity" role="status" aria-live="polite">
      {activity.map((a) => (
        <div key={a.id} className={`activity-item ${a.state}`}>
          <div className="activity-text">
            <span className="activity-label">{a.label}</span>
            {a.detail && <span className="activity-detail">{a.detail}</span>}
          </div>
          {a.state === "running" && a.progress !== undefined && (
            <div className="progress" aria-hidden="true">
              <div style={{ width: `${Math.round(a.progress * 100)}%` }} />
            </div>
          )}
          {a.state !== "running" && (
            <button className="ghost icon" onClick={() => dismissActivity(a.id)} aria-label="Dismiss">
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
