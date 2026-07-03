import fs from "node:fs";
import path from "node:path";

export function sanitizeFileName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "document"
  );
}

export function resolveOutputPath(title: string, customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });

  return path.join(outputDir, `${sanitizeFileName(title)}.pdf`);
}
