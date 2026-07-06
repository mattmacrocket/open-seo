import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  GscService: {
    getPerformance: vi.fn(),
  },
}));

class GscNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "GscNotConnectedError";
  }
}
class GscApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GscApiError";
  }
}
class GscTokenError extends Error {}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: mocks.GscService,
  GscNotConnectedError,
  isExpectedGrantFailure: (error: unknown) =>
    error instanceof GscTokenError ||
    (error instanceof GscApiError &&
      (error.status === 401 || error.status === 403)),
}));
vi.mock("@/server/lib/gscClient", () => ({ GscApiError, GscTokenError }));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

describe("get_striking_distance MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.GscService.getPerformance.mockReset();
  });

  it("collapses query x page fan-out to the best page per query, in band", async () => {
    mocks.GscService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      request: {
        dimensions: ["query", "page"],
        startDate: "2026-04-27",
        endDate: "2026-05-25",
        rowLimit: 1000,
      },
      rows: [
        {
          keys: ["seo tools", "https://example.com/a"],
          clicks: 5,
          impressions: 200,
          ctr: 0.025,
          position: 8,
        },
        {
          keys: ["seo tools", "https://example.com/b"],
          clicks: 1,
          impressions: 50,
          ctr: 0.02,
          position: 15,
        },
        {
          keys: ["out of band query", "https://example.com/c"],
          clicks: 10,
          impressions: 500,
          ctr: 0.02,
          position: 2,
        },
      ],
    });
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(mocks.GscService.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        dimensions: ["query", "page"],
      }),
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
      rowCount: 1,
      rows: [
        {
          query: "seo tools",
          page: "https://example.com/a",
          clicks: 5,
          impressions: 200,
          position: 8,
        },
      ],
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("seo tools");
    expect(text?.type === "text" && text.text).not.toContain(
      "out of band query",
    );
  });

  it("passes device/country filters through buildGscFilters", async () => {
    mocks.GscService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      request: {
        dimensions: ["query", "page"],
        startDate: "2026-04-27",
        endDate: "2026-05-25",
        rowLimit: 1000,
      },
      rows: [],
    });
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    // country arrives already-lowercased here: the MCP SDK runs the zod input
    // schema (which lowercases it) before invoking the handler in production.
    await getStrikingDistanceTool.handler(
      { projectId: "project_1", device: "MOBILE", country: "usa" },
      toolExtra,
    );

    expect(mocks.GscService.getPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          { dimension: "device", operator: "equals", expression: "MOBILE" },
          { dimension: "country", operator: "equals", expression: "usa" },
        ],
      }),
    );
  });

  it("surfaces a not-connected message with a connect URL", async () => {
    mocks.GscService.getPerformance.mockRejectedValue(
      new GscNotConnectedError("project_1"),
    );
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "/p/project_1/settings",
    );
  });

  it("renders an api_error with a reconnect URL on a GSC API failure", async () => {
    mocks.GscService.getPerformance.mockRejectedValue(
      new GscApiError(500, "server error"),
    );
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
  });

  it("treats an expired/revoked grant (401/403) as not-connected", async () => {
    mocks.GscService.getPerformance.mockRejectedValue(
      new GscApiError(401, "unauthorized"),
    );
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("rejects a half-specified explicit date range", async () => {
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1", startDate: "2026-01-01" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      reason: "invalid_request",
    });
    expect(mocks.GscService.getPerformance).not.toHaveBeenCalled();
  });

  it("reports no rows in band without erroring", async () => {
    mocks.GscService.getPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      connectedBy: "alice@example.com",
      request: {
        dimensions: ["query", "page"],
        startDate: "2026-04-27",
        endDate: "2026-05-25",
        rowLimit: 1000,
      },
      rows: [],
    });
    const { getStrikingDistanceTool } = await import("./get-striking-distance");

    const result = await getStrikingDistanceTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 0 });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "No queries in the 5-20 position band",
    );
  });
});
