import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildGscFilters } from "@/serverFunctions/searchPerformance";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { buildStrikingDistanceRows } from "@/server/features/gsc/searchPerformanceReport";
import { GSC_DATE_RANGES } from "@/server/features/gsc/searchAnalytics";
import { GscApiError, GscTokenError } from "@/server/lib/gscClient";
import { GSC_DEVICES } from "@/types/schemas/search-performance";
import { buildDashboardUrl } from "@/server/mcp/urls";

// query x page fan-out needs more rows to find the 5..20 band; mirrors the
// Search Performance page's own overview call (searchPerformance.ts).
const STRIKING_DISTANCE_FETCH_LIMIT = 1000;

type StrikingDistanceRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

const STRIKING_DISTANCE_COLUMNS: McpTableColumn<StrikingDistanceRow>[] = [
  { header: "query", value: (row) => row.query },
  { header: "page", value: (row) => row.page },
  { header: "clicks", value: (row) => row.clicks },
  { header: "impressions", value: (row) => row.impressions },
  {
    header: "position",
    value: (row) => row.position,
    format: (value) =>
      typeof value === "number" ? value.toFixed(1) : "unknown",
  },
];

function connectGscUrl(baseUrl: string, projectId: string): string {
  return buildDashboardUrl(baseUrl, `/p/${projectId}/settings#search-console`);
}

function describeGscError(error: unknown): string {
  if (error instanceof GscNotConnectedError) {
    return "Search Console is not connected for this project.";
  }
  if (error instanceof GscTokenError) {
    return "The Search Console connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof GscApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

const inputSchema = {
  projectId: projectIdSchema,
  dateRange: z
    .enum(GSC_DATE_RANGES)
    .optional()
    .describe(
      "Convenience window (default last_28_days). End is set ~3 days back for GSC data lag. Ignored if startDate+endDate are given. Max lookback is 16 months.",
    ),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit start (YYYY-MM-DD, Pacific Time). Use with endDate."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Explicit end (YYYY-MM-DD, Pacific Time). Use with startDate."),
  device: z
    .enum(GSC_DEVICES)
    .optional()
    .describe("Restrict to one device type."),
  country: z
    .string()
    .length(3)
    .transform((value) => value.toLowerCase())
    .optional()
    .describe(
      "ISO-3166-1 alpha-3 country code (e.g. 'usa') to restrict to. GSC returns this dimension lowercase.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getStrikingDistanceTool = {
  name: "get_striking_distance",
  config: {
    title: "Get striking-distance queries",
    description:
      "Find queries already ranking in positions 5-20 on the connected Search Console property: the band where a content improvement most plausibly moves real traffic. Collapses GSC's query x page fan-out to each query's single best-ranking page first (a query only counts as striking distance when its BEST page is in band), unlike raw get_search_console_performance rows which fan out per page. Sorted by impressions, capped at 100 rows. First-party GSC data; read-only, uses no credits.",
    inputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      rowCount: z.number().optional(),
      rows: z
        .array(
          z.object({
            query: z.string(),
            page: z.string(),
            clicks: z.number(),
            impressions: z.number(),
            position: z.number(),
          }),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const connectUrl = connectGscUrl(context.baseUrl, args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/search-performance`,
    );

    if (Boolean(args.startDate) !== Boolean(args.endDate)) {
      return mcpResponse({
        text: "Provide both startDate and endDate, or neither (use dateRange instead).",
        meta,
        structuredContent: { ok: false, reason: "invalid_request" },
      });
    }

    const { filters } = buildGscFilters({
      device: args.device,
      country: args.country,
    });

    try {
      const result = await GscService.getPerformance({
        projectId: args.projectId,
        startDate: args.startDate,
        endDate: args.endDate,
        dateRange: args.dateRange,
        dimensions: ["query", "page"],
        filters,
        rowLimit: STRIKING_DISTANCE_FETCH_LIMIT,
      });

      const rows = buildStrikingDistanceRows(result.rows);
      const header = `${result.siteUrl} · ${result.request.startDate}→${result.request.endDate} · ${rows.length} striking-distance quer${rows.length === 1 ? "y" : "ies"} (position 5-20)`;
      const text =
        rows.length > 0
          ? `${header}\n${formatMcpTable(rows, STRIKING_DISTANCE_COLUMNS)}`
          : `${header}\nNo queries in the 5-20 position band for this date range.`;

      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          siteUrl: result.siteUrl,
          startDate: result.request.startDate,
          endDate: result.request.endDate,
          rowCount: rows.length,
          rows,
        },
      });
    } catch (error) {
      const isNotConnected =
        error instanceof GscNotConnectedError || isExpectedGrantFailure(error);
      return mcpResponse({
        text: `${describeGscError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
        meta,
        structuredContent: {
          ok: false,
          reason: isNotConnected ? "not_connected" : "api_error",
          connectUrl,
        },
      });
    }
  }),
};
