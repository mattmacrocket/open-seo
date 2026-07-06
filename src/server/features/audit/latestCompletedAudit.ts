/**
 * Pure selection helper for "pick from latest audit" (Indexation Coverage).
 * Kept separate from the server function so the selection rule is unit
 * testable without a database.
 */

type AuditStatusRow = {
  status: string;
  startedAt: string;
};

/** `AuditRepository.getAuditsByProject` already orders by startedAt desc, so
 *  the first "completed" entry is the most recent completed run. A project
 *  with only running/failed audits (or none at all) yields `undefined`, which
 *  callers should render as an honest empty state rather than an error. */
export function findLatestCompletedAudit<T extends AuditStatusRow>(
  audits: T[],
): T | undefined {
  return audits.find((audit) => audit.status === "completed");
}
