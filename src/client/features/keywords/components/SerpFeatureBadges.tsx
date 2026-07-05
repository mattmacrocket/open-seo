import { createPortal } from "react-dom";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

/**
 * Full names for the SERP item types DataForSEO Labs reports most often.
 * Types not listed fall back to a title-cased version of the raw value, so
 * new SERP features render sensibly without a code change.
 */
const FEATURE_LABELS: Record<string, string> = {
  ai_overview: "AI Overview",
  answer_box: "Answer box",
  carousel: "Carousel",
  commercial_units: "Commercial units",
  discussions_and_forums: "Discussions and forums",
  featured_snippet: "Featured snippet",
  find_results_on: "Find results on",
  google_flights: "Google Flights",
  google_hotels: "Google Hotels",
  google_posts: "Google posts",
  google_reviews: "Google reviews",
  hotels_pack: "Hotels pack",
  images: "Images",
  jobs: "Jobs",
  knowledge_graph: "Knowledge graph",
  local_pack: "Local pack",
  local_services: "Local services",
  map: "Map",
  multi_carousel: "Multi carousel",
  paid: "Paid ads",
  people_also_ask: "People also ask",
  people_also_search: "People also search for",
  perspectives: "Perspectives",
  popular_products: "Popular products",
  questions_and_answers: "Questions and answers",
  recipes: "Recipes",
  refine_products: "Refine products",
  related_searches: "Related searches",
  shopping: "Shopping",
  short_videos: "Short videos",
  stocks_box: "Stocks box",
  top_sights: "Top sights",
  top_stories: "Top stories",
  twitter: "X (Twitter)",
  video: "Videos",
  visual_stories: "Visual stories",
};

/** Compact badge text; falls back to the full label for unlisted types. */
const SHORT_LABELS: Record<string, string> = {
  ai_overview: "AI",
  answer_box: "Answer",
  featured_snippet: "Snippet",
  knowledge_graph: "KG",
  local_pack: "Local",
  paid: "Ads",
  people_also_ask: "PAA",
  people_also_search: "PASF",
  related_searches: "Related",
  short_videos: "Shorts",
  top_stories: "News",
  video: "Video",
};

/**
 * Features surfaced first on the compact badges. ai_overview leads: it is the
 * AEO signal (the keyword's SERP answers with an AI Overview).
 */
const DISPLAY_PRIORITY = [
  "ai_overview",
  "featured_snippet",
  "people_also_ask",
  "local_pack",
  "knowledge_graph",
  "paid",
  "shopping",
  "video",
  "images",
  "top_stories",
];

/**
 * "organic" appears on virtually every SERP, so it carries no signal as a
 * badge; everything else is worth surfacing.
 */
const HIDDEN_FEATURES = new Set(["organic"]);

const MAX_VISIBLE = 3;

function titleCase(raw: string): string {
  const words = raw.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fullLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? titleCase(feature);
}

function shortLabel(feature: string): string {
  return SHORT_LABELS[feature] ?? fullLabel(feature);
}

function orderFeatures(features: string[]): string[] {
  const shown = features.filter((feature) => !HIDDEN_FEATURES.has(feature));
  const prioritized = DISPLAY_PRIORITY.filter((feature) =>
    shown.includes(feature),
  );
  const rest = shown.filter((feature) => !prioritized.includes(feature));
  return [...prioritized, ...rest];
}

const BADGE_BASE =
  "inline-flex h-5 items-center rounded-full border px-1.5 text-[11px] font-medium leading-none whitespace-nowrap";
const BADGE_DEFAULT = `${BADGE_BASE} border-base-300 bg-base-200 text-base-content/70`;
// AI Overview gets a distinct treatment: it is the answer-engine signal.
const BADGE_AI = `${BADGE_BASE} border-secondary/40 bg-secondary/15 text-secondary font-semibold`;

/**
 * Compact per-keyword SERP feature badges: up to three short badges plus a
 * "+N" overflow, with a tooltip listing every feature by full name.
 */
export function SerpFeatureBadges({ features }: { features: string[] }) {
  const tooltip = useFloatingTooltip<HTMLSpanElement>({ delayMs: 0 });
  const ordered = orderFeatures(features);

  if (ordered.length === 0) {
    return <span className="text-base-content/40">-</span>;
  }

  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflowCount = ordered.length - visible.length;

  return (
    <span
      ref={tooltip.triggerRef}
      className="inline-flex cursor-help items-center gap-1"
      tabIndex={0}
      aria-label={`SERP features: ${ordered.map(fullLabel).join(", ")}`}
      aria-describedby={tooltip.isOpen ? tooltip.tooltipId : undefined}
      onMouseEnter={tooltip.open}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.open}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
    >
      {visible.map((feature) => (
        <span
          key={feature}
          className={feature === "ai_overview" ? BADGE_AI : BADGE_DEFAULT}
        >
          {shortLabel(feature)}
        </span>
      ))}
      {overflowCount > 0 ? (
        <span className={BADGE_DEFAULT}>+{overflowCount}</span>
      ) : null}
      {tooltip.isOpen && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              <span className="block font-semibold">SERP features</span>
              <span className="mt-1 block">
                {ordered.map((feature) => (
                  <span key={feature} className="block">
                    {fullLabel(feature)}
                    {feature === "ai_overview"
                      ? " (Google answers this query with AI)"
                      : ""}
                  </span>
                ))}
              </span>
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </span>
  );
}
