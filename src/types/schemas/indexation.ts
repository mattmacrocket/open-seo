import { z } from "zod";

/** Matches the existing `inspect_urls` MCP tool cap (search-console-tools.ts):
 *  `GscService.inspectUrls` awaits each URL sequentially, so 10 keeps a single
 *  call to roughly 10-20s worst case. Do not raise this without changing the
 *  execution model to bounded concurrency. */
export const INDEXATION_MAX_URLS = 10;

export const inspectIndexationUrlsSchema = z.object({
  projectId: z.string().min(1),
  urls: z
    .array(z.string().url())
    .min(1, "Enter at least one URL")
    .max(INDEXATION_MAX_URLS, `Enter at most ${INDEXATION_MAX_URLS} URLs`),
});

export const getLatestAuditUrlsSchema = z.object({
  projectId: z.string().min(1),
});
