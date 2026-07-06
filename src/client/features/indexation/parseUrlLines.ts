/** Split pasted text into URLs: one per line, trimmed, blanks dropped. Pure so
 *  it's unit testable without mounting the page. */
export function parseUrlLines(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
