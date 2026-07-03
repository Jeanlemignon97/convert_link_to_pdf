import { extractDocument } from "./extract.js";
import { writePdf } from "./pdf.js";

export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ConvertContentLinkToPdf/1.0; +https://github.com/)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

export async function convertUrlToPdf(url: string, outputPath: string): Promise<void> {
  const html = await fetchHtml(url);
  const document = extractDocument(html, url);

  await writePdf(outputPath, document);
}
