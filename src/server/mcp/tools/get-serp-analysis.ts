import { z } from "zod";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LOCATION_CODE,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import type { SerpResultItem } from "@/types/keywords";

const SERP_ANALYSIS_COLUMNS: McpTableColumn<SerpResultItem>[] = [
  { header: "rank", value: (row) => row.rank },
  { header: "domain", value: (row) => row.domain },
  { header: "title", value: (row) => row.title },
  { header: "referring domains", value: (row) => row.referringDomains },
  { header: "backlinks", value: (row) => row.backlinks },
  { header: "ETV", value: (row) => row.etv },
];

const inputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .describe("Search query to analyze the live SERP for."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getSerpAnalysisTool = {
  name: "get_serp_analysis",
  config: {
    title: "Analyze a keyword's live SERP",
    description:
      "Fetch the live organic Google results for one query with per-result authority context: rank, title, URL, estimated traffic value (ETV), referring domains, and backlinks. Use this to see what the current top results contain (their intent, structure, and authority) before writing a content fix for that query. Charges credits for the one query (~30-60 credits, same cost as get_serp_results). Does not save results to OpenSEO; results are cached for 12 hours.",
    inputSchema,
    outputSchema: {
      requestedKeyword: z.string(),
      reason: z.enum(["no_organic_results"]).optional(),
      items: z.array(
        z.object({
          rank: z.number(),
          title: z.string(),
          url: z.string(),
          domain: z.string(),
          description: z.string(),
          etv: z.number().nullable(),
          estimatedPaidTrafficCost: z.number().nullable(),
          referringDomains: z.number().nullable(),
          backlinks: z.number().nullable(),
          isNew: z.boolean(),
          rankChange: z.number().nullable(),
        }),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await KeywordResearchService.getSerpAnalysis(
      {
        projectId: args.projectId,
        keyword: args.keyword,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      },
      context.billing,
    );

    const header = `"${result.requestedKeyword}" (${result.items.length} organic results)`;
    const text =
      result.items.length > 0
        ? `${header}\n${formatMcpTable(result.items, SERP_ANALYSIS_COLUMNS)}`
        : `${header}\nNo organic results returned for this query.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: {
        requestedKeyword: result.requestedKeyword,
        reason: result.reason,
        items: result.items,
      },
    });
  }),
};
