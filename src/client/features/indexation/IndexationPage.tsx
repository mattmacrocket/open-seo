import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { AuditUrlPicker } from "@/client/features/indexation/IndexationParts";
import {
  buildIndexationColumns,
  type IndexationReport,
} from "@/client/features/indexation/IndexationColumns";
import { parseUrlLines } from "@/client/features/indexation/parseUrlLines";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  inspectIndexationUrls,
  getLatestAuditUrls,
} from "@/serverFunctions/indexation";
import { getGscConnection } from "@/serverFunctions/gsc";
import { INDEXATION_MAX_URLS } from "@/types/schemas/indexation";

function ResultsTable({ report }: { report: IndexationReport }) {
  const columns = buildIndexationColumns();
  const table = useAppTable({ data: report.results, columns });
  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3 text-sm text-base-content/60">
        {report.siteUrl}
        {report.connectedBy ? ` · connected by ${report.connectedBy}` : ""}
      </div>
      <AppDataTable
        table={table}
        className="table table-sm"
        wrapperClassName="overflow-x-auto"
      />
    </div>
  );
}

export function IndexationPage({ projectId }: { projectId: string }) {
  const [urlInput, setUrlInput] = useState("");

  const connectionQuery = useQuery({
    queryKey: ["gscConnection", projectId],
    queryFn: () => getGscConnection({ data: { projectId } }),
  });
  const connected = Boolean(connectionQuery.data?.connected);

  const auditUrlsQuery = useQuery({
    queryKey: ["indexationLatestAuditUrls", projectId],
    queryFn: () => getLatestAuditUrls({ data: { projectId } }),
    enabled: connected,
  });

  const inspect = useMutation({
    mutationFn: (urls: string[]) =>
      inspectIndexationUrls({ data: { projectId, urls } }),
    onSuccess: (result, urls) => {
      if (!result.connected) return;
      captureClientEvent("indexation:inspect", {
        url_count: urls.length,
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Inspection failed"));
    },
  });

  const urls = parseUrlLines(urlInput);
  const tooMany = urls.length > INDEXATION_MAX_URLS;
  const canInspect = urls.length > 0 && !tooMany && !inspect.isPending;

  const handleInspect = () => {
    if (!canInspect) return;
    inspect.mutate(urls);
  };

  const report = inspect.data;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Indexation Coverage</h1>
          <p className="text-sm text-base-content/70">
            Ask Google directly: is this page indexed, and why not? Paste up to{" "}
            {INDEXATION_MAX_URLS} URLs to run Search Console&apos;s URL
            Inspection: index/coverage state, last crawl time, canonical, and
            mobile/rich-results verdicts.
          </p>
        </div>

        {connectionQuery.isPending ? (
          <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
            <Loader2 className="size-4 animate-spin" /> Loading Search Console
            connection…
          </div>
        ) : !connected ? (
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-base-content/70">
              Connect Search Console to inspect exactly how Google sees your
              pages.
            </p>
            <SearchConsoleConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={4}
                placeholder="https://example.com/page-one&#10;https://example.com/page-two"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                aria-label="URLs to inspect"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AuditUrlPicker
                  auditUrlsQuery={auditUrlsQuery}
                  onPick={setUrlInput}
                />
                <div className="flex items-center gap-3">
                  {tooMany ? (
                    <span className="text-xs text-error">
                      Enter at most {INDEXATION_MAX_URLS} URLs ({urls.length}{" "}
                      entered)
                    </span>
                  ) : urls.length > 0 ? (
                    <span className="text-xs text-base-content/50">
                      {urls.length} URL{urls.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1.5"
                    onClick={handleInspect}
                    disabled={!canInspect}
                  >
                    {inspect.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Search className="size-3.5" />
                    )}
                    Inspect
                  </button>
                </div>
              </div>
            </div>

            {inspect.isPending ? (
              <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
                <Loader2 className="size-4 animate-spin" /> Inspecting URLs…this
                can take up to 20 seconds for {urls.length} URL
                {urls.length === 1 ? "" : "s"}.
              </div>
            ) : report && !report.connected ? (
              <div className="max-w-2xl space-y-4">
                <p className="text-sm text-base-content/70">
                  Search Console&apos;s connection needs to be reconnected
                  before we can inspect URLs.
                </p>
                <SearchConsoleConnectionCard projectId={projectId} />
              </div>
            ) : report?.connected ? (
              <ResultsTable report={report} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
