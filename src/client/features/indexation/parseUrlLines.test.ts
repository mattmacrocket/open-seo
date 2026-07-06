import { describe, expect, it } from "vitest";
import { parseUrlLines } from "./parseUrlLines";

describe("parseUrlLines", () => {
  it("returns an empty array for empty input", () => {
    expect(parseUrlLines("")).toEqual([]);
  });

  it("splits one URL per line", () => {
    expect(
      parseUrlLines("https://example.com/a\nhttps://example.com/b"),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("trims whitespace around each line", () => {
    expect(
      parseUrlLines("  https://example.com/a  \n\thttps://example.com/b\t"),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("drops blank lines", () => {
    expect(
      parseUrlLines("https://example.com/a\n\n\nhttps://example.com/b\n"),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("drops whitespace-only lines", () => {
    expect(
      parseUrlLines("https://example.com/a\n   \nhttps://example.com/b"),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });
});
