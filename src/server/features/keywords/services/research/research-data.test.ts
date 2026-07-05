import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import {
  KeywordDataInfo,
  KeywordInfo,
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo,
  MonthlySearchesInfo,
  SerpInfo,
} from "dataforseo-client";
import { mapAdsKeywordItems, mapKeywordDataItems } from "./research-data";

const adsItem = (
  data: ConstructorParameters<
    typeof KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo
  >[0],
) => new KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo(data);

describe("mapKeywordDataItems", () => {
  it("maps serp_info item types into serpFeatures, deduped in SERP order", () => {
    const rows = mapKeywordDataItems([
      new KeywordDataInfo({
        keyword: "SEO Tools",
        keyword_info: new KeywordInfo({
          search_volume: 2400,
          cpc: 3.25,
          competition: 0.4,
        }),
        serp_info: new SerpInfo({
          serp_item_types: [
            "organic",
            "ai_overview",
            "people_also_ask",
            "ai_overview",
          ],
        }),
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "seo tools",
      searchVolume: 2400,
      serpFeatures: ["organic", "ai_overview", "people_also_ask"],
    });
  });

  it("returns empty serpFeatures when serp_info is absent", () => {
    const rows = mapKeywordDataItems([
      new KeywordDataInfo({
        keyword: "seo tools",
        keyword_info: new KeywordInfo({ search_volume: 100 }),
      }),
    ]);

    expect(rows[0]?.serpFeatures).toEqual([]);
  });

  it("keeps unknown feature types and drops malformed entries", () => {
    // Build serp_info with off-contract wire payloads without asserting types.
    const serpInfoWith = (serpItemTypes: unknown) =>
      Object.assign(new SerpInfo(), { serp_item_types: serpItemTypes });

    const rows = mapKeywordDataItems([
      new KeywordDataInfo({
        keyword: "seo tools",
        serp_info: serpInfoWith(["future_serp_widget", "", 42, null]),
      }),
      new KeywordDataInfo({
        keyword: "seo audit",
        serp_info: serpInfoWith("organic"),
      }),
    ]);

    expect(rows[0]?.serpFeatures).toEqual(["future_serp_widget"]);
    // A non-array payload degrades to "no SERP data" instead of throwing.
    expect(rows[1]?.serpFeatures).toEqual([]);
  });
});

describe("mapAdsKeywordItems", () => {
  it("maps Google Ads items to research rows without KD/intent", () => {
    const rows = mapAdsKeywordItems([
      adsItem({
        keyword: "Hotel Reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [
          new MonthlySearchesInfo({
            year: 2026,
            month: 5,
            search_volume: 1300,
          }),
        ],
      }),
    ]);

    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        trend: [{ year: 2026, month: 5, searchVolume: 1300 }],
        cpc: 2.54,
        competition: 0.42,
        keywordDifficulty: null,
        intent: "unknown",
        serpFeatures: [],
      },
    ]);
  });

  it("dedupes case-variant keywords and skips empty ones", () => {
    const rows = mapAdsKeywordItems([
      adsItem({ keyword: "northern lights tour", search_volume: 320 }),
      adsItem({ keyword: "Northern Lights Tour", search_volume: 320 }),
      adsItem({ keyword: undefined }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "northern lights tour",
      searchVolume: 320,
      competition: null,
      cpc: null,
      trend: [],
    });
  });
});
