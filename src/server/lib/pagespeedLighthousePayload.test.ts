import { describe, expect, it } from "vitest";
import { parsePagespeedLighthousePayload } from "@/server/lib/pagespeedLighthousePayload";
import { readStoredLighthousePayload } from "@/server/lib/lighthousePayload";

const parseInput = {
  url: "https://example.com/",
  strategy: "mobile",
} as const;

function baseResponse() {
  return {
    lighthouseResult: {
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      lighthouseVersion: "12.6.0",
      categories: {
        performance: { score: 0.91, auditRefs: [] },
        accessibility: { score: 0.88, auditRefs: [] },
        "best-practices": { score: 0.79, auditRefs: [] },
        seo: { score: 1, auditRefs: [] },
      },
      audits: {},
    },
  };
}

function cruxBlock(overrides: Record<string, unknown> = {}) {
  return {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1988, category: "FAST" },
      INTERACTION_TO_NEXT_PAINT: { percentile: 231, category: "AVERAGE" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
    },
    overall_category: "AVERAGE",
    ...overrides,
  };
}

describe("parsePagespeedLighthousePayload field data", () => {
  it("parses page and origin loading experience into fieldData", () => {
    const parsed = parsePagespeedLighthousePayload(
      {
        ...baseResponse(),
        loadingExperience: cruxBlock(),
        originLoadingExperience: cruxBlock({
          metrics: {
            LARGEST_CONTENTFUL_PAINT_MS: {
              percentile: 2600,
              category: "AVERAGE",
            },
            INTERACTION_TO_NEXT_PAINT: { percentile: 540, category: "SLOW" },
            CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31, category: "SLOW" },
          },
          overall_category: "SLOW",
        }),
      },
      parseInput,
    );

    expect(parsed.fieldData).toEqual({
      page: {
        lcpMs: 1988,
        lcpCategory: "FAST",
        inpMs: 231,
        inpCategory: "AVERAGE",
        // CrUX reports CLS p75 as an integer scaled by 100.
        cls: 0.05,
        clsCategory: "FAST",
        overallCategory: "AVERAGE",
      },
      origin: {
        lcpMs: 2600,
        lcpCategory: "AVERAGE",
        inpMs: 540,
        inpCategory: "SLOW",
        cls: 0.31,
        clsCategory: "SLOW",
        overallCategory: "SLOW",
      },
    });

    // The stored payload (with fieldData) must survive an R2 round-trip
    // through the strict stored-payload schema.
    const roundTrip = readStoredLighthousePayload(JSON.stringify(parsed));
    expect(roundTrip.storedPayload?.fieldData).toEqual(parsed.fieldData);
  });

  it("omits fieldData when the response has no loading experience", () => {
    const parsed = parsePagespeedLighthousePayload(baseResponse(), parseInput);
    expect(parsed.fieldData).toBeUndefined();
    expect(parsed.scores.performance).toBe(91);

    const roundTrip = readStoredLighthousePayload(JSON.stringify(parsed));
    expect(roundTrip.storedPayload).not.toBeNull();
    expect(roundTrip.storedPayload?.fieldData).toBeUndefined();
  });

  it("treats an origin_fallback block as origin data, not page data", () => {
    const parsed = parsePagespeedLighthousePayload(
      {
        ...baseResponse(),
        loadingExperience: cruxBlock({ origin_fallback: true }),
      },
      parseInput,
    );

    expect(parsed.fieldData?.page).toBeUndefined();
    expect(parsed.fieldData?.origin?.lcpMs).toBe(1988);
    expect(parsed.fieldData?.origin?.overallCategory).toBe("AVERAGE");
  });

  it("skips empty CrUX blocks with no metric values", () => {
    const parsed = parsePagespeedLighthousePayload(
      {
        ...baseResponse(),
        loadingExperience: { metrics: {}, overall_category: "NONE" },
      },
      parseInput,
    );

    expect(parsed.fieldData).toBeUndefined();
  });

  it("does not fail the whole parse on malformed field data", () => {
    const parsed = parsePagespeedLighthousePayload(
      {
        ...baseResponse(),
        loadingExperience: {
          metrics: {
            LARGEST_CONTENTFUL_PAINT_MS: { percentile: "not-a-number" },
          },
        },
        originLoadingExperience: cruxBlock(),
      },
      parseInput,
    );

    // The malformed page block is dropped; the valid origin block survives.
    expect(parsed.fieldData?.page).toBeUndefined();
    expect(parsed.fieldData?.origin?.inpMs).toBe(231);
    expect(parsed.scores.performance).toBe(91);
  });

  it("maps unknown categories to null instead of failing", () => {
    const parsed = parsePagespeedLighthousePayload(
      {
        ...baseResponse(),
        loadingExperience: cruxBlock({ overall_category: "NONE" }),
      },
      parseInput,
    );

    expect(parsed.fieldData?.page?.overallCategory).toBeNull();
    expect(parsed.fieldData?.page?.lcpCategory).toBe("FAST");
  });
});
