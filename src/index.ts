import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

type ParsedArgs = {
  url: string;
  outputPath?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [url, outputPath] = argv;

  if (!url) {
    throw new Error('Usage: npm run convert -- "<url>" [output.pdf]');
  }

  return { url, outputPath };
}

function sanitizeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ConvertLinkToPdf/1.0; +https://github.com/)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

function extractContent(html: string, url: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.textContent?.trim()) {
    throw new Error("Unable to extract readable text from this page.");
  }

  return {
    title: article.title?.trim() || "Untitled Document",
    text: article.textContent.trim()
  };
}

function resolveOutputPath(title: string, customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });

  return path.join(outputDir, `${sanitizeFileName(title)}.pdf`);
}

function normalizeParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function writePdf(outputPath: string, title: string, sourceUrl: string, text: string): Promise<void> {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 56,
        bottom: 56,
        left: 56,
        right: 56
      }
    });

    const stream = fs.createWriteStream(outputPath);
    stream.on("finish", resolve);
    stream.on("error", reject);

    doc.on("error", reject);
    doc.pipe(stream);

    doc.font("Helvetica-Bold").fontSize(20).text(title);
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text(sourceUrl);
    doc.moveDown();
    doc.fillColor("#000000");

    for (const paragraph of normalizeParagraphs(text)) {
      doc.font("Helvetica").fontSize(12).text(paragraph, {
        align: "left",
        lineGap: 4
      });
      doc.moveDown();
    }

    doc.end();
  });
}

async function main(): Promise<void> {
  const { url, outputPath } = parseArgs(process.argv.slice(2));
  const html = await fetchHtml(url);
  const { title, text } = extractContent(html, url);
  const finalOutputPath = resolveOutputPath(title, outputPath);

  await writePdf(finalOutputPath, title, url, text);

  console.log(`PDF created: ${finalOutputPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
