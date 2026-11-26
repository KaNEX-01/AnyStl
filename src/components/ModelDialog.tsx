"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Native modal handles focus trapping; close it before unmounting to restore focus. */
export function ModelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const close = () => {
    ref.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto rounded-[24px] bg-spool-card p-0 text-spool-text shadow-xl backdrop:bg-black/70"
    >
      <div className="p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={close} aria-label={`Close ${title.toLowerCase()}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-spool-muted hover:bg-spool-chip hover:text-spool-text">
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
