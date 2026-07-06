import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { getLatestAuditUrls } from "@/serverFunctions/indexation";
import { INDEXATION_MAX_URLS } from "@/types/schemas/indexation";

type AuditUrlsResult = Awaited<ReturnType<typeof getLatestAuditUrls>>;

/** "Pick from latest audit" helper: lets the user select up to
 *  INDEXATION_MAX_URLS pages crawled by the most recent completed site audit
 *  instead of copy-pasting URLs by hand. */
export function AuditUrlPicker({
  auditUrlsQuery,
  onPick,
}: {
  auditUrlsQuery: UseQueryResult<AuditUrlsResult>;
  onPick: (urlsText: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const data = auditUrlsQuery.data;

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
      >
        Pick from latest audit
      </button>
    );
  }

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else if (next.size < INDEXATION_MAX_URLS) {
        next.add(url);
      }
      return next;
    });
  };

  return (
    <div className="w-full space-y-2 rounded-lg border border-base-300 bg-base-200/30 p-3">
      {auditUrlsQuery.isPending ? (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-3.5 animate-spin" /> Loading audit pages…
        </div>
      ) : !data || data.urls.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No completed site audit yet. Run a Site Audit to pick pages here.
        </p>
      ) : (
        <>
          <p className="text-xs text-base-content/50">
            From the audit completed{" "}
            {data.completedAt
              ? new Date(data.completedAt).toLocaleDateString("en-US")
              : "recently"}
            . Select up to {INDEXATION_MAX_URLS}.
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {data.urls.map((url) => (
              <label
                key={url}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={selected.has(url)}
                  onChange={() => toggle(url)}
                  disabled={
                    !selected.has(url) && selected.size >= INDEXATION_MAX_URLS
                  }
                />
                <span className="truncate" title={url}>
                  {url}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-xs"
          disabled={selected.size === 0}
          onClick={() => {
            onPick(Array.from(selected).join("\n"));
            setOpen(false);
            setSelected(new Set());
          }}
        >
          Use {selected.size || ""} selected
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => {
            setOpen(false);
            setSelected(new Set());
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
