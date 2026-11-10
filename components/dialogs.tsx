"use client";

// In-app replacements for the browser's prompt() and confirm() boxes.
// Usage: const { ask, confirm, choose } = useDialogs();
//        const name = await ask({ title: "New folder" });      // string or null
//        const ok = await confirm({ title: "Delete?", danger: true });
//        const id = await choose({ title: "Move to", options });     // value or null

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type AskOptions = { title: string; label?: string; initial?: string; okLabel?: string };
type ConfirmOptions = {
  title: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type ChooseOptions = {
  title: string;
  label?: string;
  options: { value: string; label: string }[];
  okLabel?: string;
};

type Request =
  | ({ kind: "ask"; resolve: (v: string | null) => void } & AskOptions)
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: "choose"; resolve: (v: string | null) => void } & ChooseOptions);

type Dialogs = {
  ask: (o: AskOptions) => Promise<string | null>;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  choose: (o: ChooseOptions) => Promise<string | null>;
};

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used inside DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequestState] = useState<Request | null>(null);
  const [serial, setSerial] = useState(0);

  // If a dialog is already open, cancel it before showing the new one, so the
  // code waiting on the first never hangs.
  const setRequest = useCallback((next: Request | null) => {
    setRequestState((prev) => {
      if (prev && next) {
        if (prev.kind === "confirm") prev.resolve(false);
        else prev.resolve(null);
      }
      return next;
    });
    setSerial((n) => n + 1);
  }, []);

  const ask = useCallback(
    (o: AskOptions) => new Promise<string | null>((resolve) => setRequest({ kind: "ask", resolve, ...o })),
    [setRequest]
  );
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ kind: "confirm", resolve, ...o })),
    [setRequest]
  );
  const choose = useCallback(
    (o: ChooseOptions) => new Promise<string | null>((resolve) => setRequest({ kind: "choose", resolve, ...o })),
    [setRequest]
  );

  return (
    <DialogContext.Provider value={{ ask, confirm, choose }}>
      {children}
      {request && <DialogBox key={serial} request={request} onDone={() => setRequestState(null)} />}
    </DialogContext.Provider>
  );
}

function DialogBox({ request, onDone }: { request: Request; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(
    request.kind === "ask" ? request.initial ?? "" : request.kind === "choose" ? request.options[0]?.value ?? "" : ""
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function finish(ok: boolean) {
    if (request.kind === "ask") {
      const trimmed = value.trim();
      request.resolve(ok && trimmed ? trimmed : null);
    } else if (request.kind === "choose") {
      request.resolve(ok ? value : null);
    } else {
      request.resolve(ok);
    }
    onDone();
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
      onClick={(e) => e.target === ref.current && finish(false)}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          finish(true);
        }}
      >
        <h2>{request.title}</h2>
        {request.kind === "confirm" && request.message && <p className="muted">{request.message}</p>}
        {request.kind === "ask" && (
          <label className="field">
            {request.label && <span>{request.label}</span>}
            <input
              type="text"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => {
                // Select the name but not the extension, like a file manager does.
                const dot = e.target.value.lastIndexOf(".");
                e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
              }}
            />
          </label>
        )}
        {request.kind === "choose" && (
          <label className="field">
            {request.label && <span>{request.label}</span>}
            <select autoFocus value={value} onChange={(e) => setValue(e.target.value)}>
              {request.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => finish(false)}>
            {(request.kind === "confirm" && request.cancelLabel) || "Cancel"}
          </button>
          <button
            type="submit"
            className={request.kind === "confirm" && request.danger ? "danger solid" : "primary"}
            autoFocus={request.kind === "confirm"}
          >
            {request.okLabel ?? (request.kind === "confirm" ? "OK" : "Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
