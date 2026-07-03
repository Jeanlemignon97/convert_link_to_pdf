import { sanitizeFileName } from "../converter/paths.js";

export function createNumberedPdfFileName(
  position: number,
  title: string,
  usedNames: Set<string>
): string {
  const prefix = Math.max(1, position);
  const sanitizedTitle = sanitizeFileName(title);
  let fileName = `${prefix} - ${sanitizedTitle}.pdf`;
  let duplicateIndex = 2;

  while (usedNames.has(fileName)) {
    fileName = `${prefix} - ${sanitizedTitle}-${duplicateIndex}.pdf`;
    duplicateIndex += 1;
  }

  usedNames.add(fileName);
  return fileName;
}
