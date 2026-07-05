import type {
  LighthouseFieldData,
  LighthouseMetrics,
  LighthouseScores,
} from "./types";

export function LighthouseIssuesSummary({
  scores,
  metrics,
  fieldData,
}: {
  scores?: LighthouseScores | null;
  metrics?: LighthouseMetrics | null;
  fieldData?: LighthouseFieldData | null;
}) {
  const metricItems = getMetricItems(metrics);
  const fieldEntry = fieldData?.page ?? fieldData?.origin;

  if (!scores && metricItems.length === 0 && !fieldEntry) {
    return null;
  }

  return (
    <>
      {scores ? (
        <div className="grid grid-cols-4 gap-3">
          <ScoreGauge label="Performance" score={scores.performance} />
          <ScoreGauge label="Accessibility" score={scores.accessibility} />
          <ScoreGauge label="Best Practices" score={scores["best-practices"]} />
          <ScoreGauge label="SEO" score={scores.seo} />
        </div>
      ) : null}
      {metricItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 rounded-box border border-base-300 bg-base-200/25 px-4 py-3">
          {metricItems.map((metric) => (
            <div
              key={metric.label}
              className="flex items-baseline justify-between gap-2 py-1"
            >
              <span className="text-xs text-base-content/50 uppercase tracking-wide">
                {metric.label}
              </span>
              <span className="text-sm font-semibold tabular-nums text-base-content">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {fieldEntry ? (
        <FieldDataSummary
          entry={fieldEntry}
          isOriginFallback={fieldData?.page == null}
        />
      ) : null}
    </>
  );
}

type FieldDataEntry = NonNullable<LighthouseFieldData["page"]>;
type FieldCategory = FieldDataEntry["overallCategory"];

function fieldCategoryClass(category: FieldCategory) {
  if (category === "FAST") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (category === "AVERAGE") {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  if (category === "SLOW") {
    return "border-error/30 bg-error/10 text-error";
  }
  return "border-base-300 bg-base-200/40 text-base-content/60";
}

function formatFieldMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function getFieldItems(entry: FieldDataEntry) {
  const items: Array<{
    label: string;
    value: string;
    category: FieldCategory;
  }> = [];
  if (entry.lcpMs != null) {
    items.push({
      label: "LCP",
      value: formatFieldMs(entry.lcpMs),
      category: entry.lcpCategory,
    });
  }
  if (entry.inpMs != null) {
    items.push({
      label: "INP",
      value: formatFieldMs(entry.inpMs),
      category: entry.inpCategory,
    });
  }
  if (entry.cls != null) {
    items.push({
      label: "CLS",
      value: entry.cls.toFixed(2),
      category: entry.clsCategory,
    });
  }
  return items;
}

function FieldDataSummary({
  entry,
  isOriginFallback,
}: {
  entry: FieldDataEntry;
  isOriginFallback: boolean;
}) {
  const items = getFieldItems(entry);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-box border border-base-300 bg-base-200/25 px-4 py-3">
      <span className="text-xs text-base-content/50 uppercase tracking-wide">
        Field data (real users, 28-day CrUX)
      </span>
      {isOriginFallback ? (
        <span
          className="badge badge-sm border border-base-300 bg-base-200/60 text-base-content/60"
          title="No page-level data in CrUX; showing whole-origin numbers"
        >
          origin
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <span
            key={item.label}
            title={`75th percentile ${item.label} for real Chrome users`}
            className={`badge badge-sm gap-1 border font-medium tabular-nums ${fieldCategoryClass(item.category)}`}
          >
            <span className="uppercase tracking-wide opacity-70">
              {item.label}
            </span>
            {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function scoreColor(score: number | null) {
  if (score == null) return "text-base-content/40";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}

function scoreStrokeColor(score: number | null) {
  if (score == null) return "stroke-base-content/20";
  if (score >= 90) return "stroke-success";
  if (score >= 50) return "stroke-warning";
  return "stroke-error";
}

function ScoreGauge({ label, score }: { label: string; score: number | null }) {
  const displayScore = score ?? 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="4"
            className="stroke-base-300/60"
          />
          {score != null ? (
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
              className={scoreStrokeColor(score)}
            />
          ) : null}
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${scoreColor(score)}`}
        >
          {score ?? "-"}
        </span>
      </div>
      <span className="text-[11px] text-base-content/55 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function getMetricItems(metrics?: LighthouseMetrics | null) {
  if (!metrics) return [];

  return [
    { label: "FCP", value: metrics.firstContentfulPaint.displayValue },
    { label: "LCP", value: metrics.largestContentfulPaint.displayValue },
    { label: "TBT", value: metrics.totalBlockingTime.displayValue },
    { label: "SI", value: metrics.speedIndex.displayValue },
    { label: "TTI", value: metrics.timeToInteractive.displayValue },
    { label: "CLS", value: metrics.cumulativeLayoutShift.displayValue },
    { label: "INP", value: metrics.interactionToNextPaint.displayValue },
    { label: "TTFB", value: metrics.serverResponseTime.displayValue },
  ].filter(
    (metric): metric is { label: string; value: string } =>
      metric.value != null,
  );
}
