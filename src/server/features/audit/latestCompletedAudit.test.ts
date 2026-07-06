import { describe, expect, it } from "vitest";
import { findLatestCompletedAudit } from "./latestCompletedAudit";

type Row = { status: string; startedAt: string };

describe("findLatestCompletedAudit", () => {
  it("returns undefined for an empty list", () => {
    expect(findLatestCompletedAudit<Row>([])).toBeUndefined();
  });

  it("returns undefined when no audit has completed", () => {
    const audits: Row[] = [
      { status: "running", startedAt: "2026-07-05T00:00:00Z" },
      { status: "failed", startedAt: "2026-07-04T00:00:00Z" },
    ];
    expect(findLatestCompletedAudit(audits)).toBeUndefined();
  });

  it("picks the first completed audit, trusting caller ordering (startedAt desc)", () => {
    const audits: Row[] = [
      { status: "running", startedAt: "2026-07-05T00:00:00Z" },
      { status: "completed", startedAt: "2026-07-03T00:00:00Z" },
      { status: "completed", startedAt: "2026-07-01T00:00:00Z" },
    ];
    expect(findLatestCompletedAudit(audits)).toEqual(audits[1]);
  });

  it("ignores failed audits even when they are more recent than a completed one", () => {
    const audits: Row[] = [
      { status: "failed", startedAt: "2026-07-05T00:00:00Z" },
      { status: "completed", startedAt: "2026-07-02T00:00:00Z" },
    ];
    expect(findLatestCompletedAudit(audits)).toEqual(audits[1]);
  });
});
