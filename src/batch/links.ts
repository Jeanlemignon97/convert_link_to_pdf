export function extractLinks(input: string): string[] {
  const matches = input.match(/https?:\/\/[^\s,;"'<>]+/gi) ?? [];
  const cleanLinks = matches.map((link) => link.replace(/[.)\]}]+$/g, ""));

  return Array.from(new Set(cleanLinks));
}

export function mergeLinks(input: string, links: string[]): string[] {
  return Array.from(new Set([...extractLinks(input), ...links.map((link) => link.trim()).filter(Boolean)]));
}
