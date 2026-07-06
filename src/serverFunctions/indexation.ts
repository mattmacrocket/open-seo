import { createServerFn } from "@tanstack/react-start";
import { findLatestCompletedAudit } from "@/server/features/audit/latestCompletedAudit";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getLatestAuditUrlsSchema,
  inspectIndexationUrlsSchema,
} from "@/types/schemas/indexation";

/** Not connected, or a dead/denied grant (token failure or 401/403): the page
 *  renders the connect card. Other statuses (429, 5xx) are real faults. Mirrors
 *  searchPerformance.ts's isExpectedConnectionFailure exactly. */
function isExpectedConnectionFailure(error: unknown): boolean {
  return error instanceof GscNotConnectedError || isExpectedGrantFailure(error);
}

/**
 * Run Google Search Console's URL Inspection on up to 10 URLs of the
 * project's connected property. Per-URL failures are captured inline by
 * GscService.inspectUrls; only a dead/unconnected grant surfaces the connect
 * card here instead of a thrown error. All first-party GSC data, free.
 */
export const inspectIndexationUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => inspectIndexationUrlsSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { siteUrl, connectedBy, results } = await GscService.inspectUrls({
        projectId: context.projectId,
        urls: data.urls,
      });
      return { connected: true as const, siteUrl, connectedBy, results };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * URLs from the most recently *completed* audit, for the "pick from latest
 * audit" helper. Returns an empty list (never throws) when no completed audit
 * exists yet, so the picker can render an honest empty state.
 */
export const getLatestAuditUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getLatestAuditUrlsSchema.parse(data))
  .handler(async ({ context }) => {
    const audits = await AuditRepository.getAuditsByProject(context.projectId);
    const latestCompleted = findLatestCompletedAudit(audits);
    if (!latestCompleted) {
      return { auditId: null, completedAt: null, urls: [] as string[] };
    }

    const { pages } = await AuditRepository.getAuditResultsForProject(
      latestCompleted.id,
      context.projectId,
    );

    return {
      auditId: latestCompleted.id,
      completedAt: latestCompleted.completedAt,
      urls: pages.map((page) => page.url),
    };
  });
