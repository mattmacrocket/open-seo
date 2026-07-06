import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ExternalUrlCell } from "@/client/components/table/url";
import type { inspectIndexationUrls } from "@/serverFunctions/indexation";

export type IndexationReport = Extract<
  Awaited<ReturnType<typeof inspectIndexationUrls>>,
  { connected: true }
>;
type IndexationRow = IndexationReport["results"][number];

/** `coverageState` is free-form text from Google, not a documented enum: match
 *  tolerantly on `verdict` (PASS/NEUTRAL/FAIL/VERDICT_UNSPECIFIED) but always
 *  show the raw coverageState string alongside it. */
function verdictBadgeClass(verdict: string | undefined): string {
  if (verdict === "PASS") {
    return "border-success/30 bg-success/10 text-success/80";
  }
  if (verdict === "FAIL") {
    return "border-error/30 bg-error/10 text-error/80";
  }
  if (verdict === "NEUTRAL") {
    return "border-warning/35 bg-warning/10 text-warning/80";
  }
  return "border-base-300 bg-base-200 text-base-content/60";
}

function VerdictBadge({ verdict }: { verdict: string | undefined }) {
  const label = verdict ?? "UNKNOWN";
  return (
    <span
      className={`badge badge-sm border gap-1 ${verdictBadgeClass(verdict)}`}
    >
      {label}
    </span>
  );
}

function formatLastCrawlTime(value: string | undefined): string {
  if (!value) return "Never crawled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Highlights when Google's selected canonical differs from the page's
 *  declared canonical, the "canonical mismatch" signal called out in the
 *  spec. Simple string comparison in phase 1; a shared URL-normalization
 *  helper (trailing slash/scheme/www) is phase-2 scope. */
function CanonicalCell({
  googleCanonical,
  userCanonical,
}: {
  googleCanonical: string | undefined;
  userCanonical: string | undefined;
}) {
  if (!googleCanonical) {
    return <span className="text-base-content/40">-</span>;
  }
  const mismatch = Boolean(userCanonical) && userCanonical !== googleCanonical;
  return (
    <span
      className={`block max-w-xs truncate ${mismatch ? "rounded bg-warning/10 px-1.5 py-0.5 text-warning/80" : ""}`}
      title={
        mismatch
          ? `Declared canonical: ${userCanonical}\nGoogle selected: ${googleCanonical}`
          : googleCanonical
      }
    >
      {googleCanonical}
    </span>
  );
}

const helper = createColumnHelper<IndexationRow>();

export function buildIndexationColumns(): ColumnDef<IndexationRow>[] {
  return [
    helper.accessor("url", {
      header: () => "URL",
      cell: ({ getValue }) => (
        <span className="block max-w-xs truncate" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
    helper.display({
      id: "verdict",
      header: () => "Verdict",
      cell: ({ row }) => {
        if (row.original.error) {
          return <span className="badge badge-error badge-sm">Error</span>;
        }
        return (
          <VerdictBadge
            verdict={row.original.result?.indexStatusResult?.verdict}
          />
        );
      },
    }),
    helper.display({
      id: "coverageState",
      header: () => "Coverage",
      cell: ({ row }) => {
        if (row.original.error) {
          return (
            <span className="text-error/80" title={row.original.error}>
              {row.original.error}
            </span>
          );
        }
        const coverage = row.original.result?.indexStatusResult?.coverageState;
        return coverage ? (
          <span className="block max-w-xs truncate" title={coverage}>
            {coverage}
          </span>
        ) : (
          <span className="text-base-content/40">-</span>
        );
      },
    }),
    helper.display({
      id: "lastCrawlTime",
      header: () => "Last crawled",
      cell: ({ row }) =>
        formatLastCrawlTime(
          row.original.result?.indexStatusResult?.lastCrawlTime,
        ),
    }),
    helper.display({
      id: "canonical",
      header: () => "Google canonical",
      cell: ({ row }) => (
        <CanonicalCell
          googleCanonical={
            row.original.result?.indexStatusResult?.googleCanonical
          }
          userCanonical={row.original.result?.indexStatusResult?.userCanonical}
        />
      ),
    }),
    helper.display({
      id: "robotsTxtState",
      header: () => "Robots.txt",
      cell: ({ row }) => {
        const state = row.original.result?.indexStatusResult?.robotsTxtState;
        return state ? state : <span className="text-base-content/40">-</span>;
      },
    }),
    helper.display({
      id: "mobileVerdict",
      header: () => "Mobile",
      cell: ({ row }) => (
        <VerdictBadge
          verdict={row.original.result?.mobileUsabilityResult?.verdict}
        />
      ),
    }),
    helper.display({
      id: "richResultsVerdict",
      header: () => "Rich results",
      cell: ({ row }) => (
        <VerdictBadge
          verdict={row.original.result?.richResultsResult?.verdict}
        />
      ),
    }),
    helper.display({
      id: "inspectionLink",
      header: () => "",
      cell: ({ row }) =>
        row.original.result?.inspectionResultLink ? (
          <ExternalUrlCell
            value={row.original.result.inspectionResultLink}
            label="Open in GSC"
            display="raw"
            className="link link-primary inline-flex items-center gap-1 text-xs whitespace-nowrap"
          />
        ) : null,
      meta: { headerClassName: "w-24" },
    }),
  ];
}
