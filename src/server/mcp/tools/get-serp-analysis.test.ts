import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getSerpAnalysis: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: {
    getSerpAnalysis: mocks.getSerpAnalysis,
  },
}));

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

describe("get_serp_analysis MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.getSerpAnalysis.mockReset();
  });

  it("returns organic results with authority context and applies defaults", async () => {
    mocks.getSerpAnalysis.mockResolvedValue({
      requestedKeyword: "best crm software",
      items: [
        {
          rank: 1,
          title: "Best CRM Software 2026",
          url: "https://example.com/best-crm",
          domain: "example.com",
          description: "A roundup of the best CRM tools.",
          etv: 1200.5,
          estimatedPaidTrafficCost: 800,
          referringDomains: 120,
          backlinks: 900,
          isNew: false,
          rankChange: null,
        },
      ],
    });
    const { getSerpAnalysisTool } = await import("./get-serp-analysis");

    const result = await getSerpAnalysisTool.handler(
      { projectId: "project_1", keyword: "best crm software" },
      toolExtra,
    );

    expect(mocks.getSerpAnalysis).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        keyword: "best crm software",
        locationCode: 2840,
        languageCode: "en",
      },
      {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        projectId: "project_1",
      },
    );
    expect(result.structuredContent).toMatchObject({
      requestedKeyword: "best crm software",
      items: [{ rank: 1, domain: "example.com" }],
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("best crm software");
    expect(text?.type === "text" && text.text).toContain("example.com");
  });

  it("passes explicit locationCode/languageCode through", async () => {
    mocks.getSerpAnalysis.mockResolvedValue({
      requestedKeyword: "logiciel crm",
      items: [],
      reason: "no_organic_results",
    });
    const { getSerpAnalysisTool } = await import("./get-serp-analysis");

    const result = await getSerpAnalysisTool.handler(
      {
        projectId: "project_1",
        keyword: "logiciel crm",
        locationCode: 2250,
        languageCode: "fr",
      },
      toolExtra,
    );

    expect(mocks.getSerpAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2250, languageCode: "fr" }),
      expect.anything(),
    );
    expect(result.structuredContent).toMatchObject({
      reason: "no_organic_results",
      items: [],
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "No organic results returned",
    );
  });

  it("propagates errors from the underlying service", async () => {
    mocks.getSerpAnalysis.mockRejectedValue(new Error("DataForSEO down"));
    const { getSerpAnalysisTool } = await import("./get-serp-analysis");

    await expect(
      getSerpAnalysisTool.handler(
        { projectId: "project_1", keyword: "best crm software" },
        toolExtra,
      ),
    ).rejects.toThrow("DataForSEO down");
  });
});
