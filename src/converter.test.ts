import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  extractLeadImage,
  parseContentBlocks,
  writePdf,
  type ExtractedDocument
} from "./converter.js";

test("parseContentBlocks preserves headings, line breaks, lists, quotes, and images", () => {
  const html = `
    <div>
      <h2>Section Title</h2>
      <p>First line<br>Second line</p>
      <blockquote>A quoted paragraph</blockquote>
      <ul>
        <li>First item</li>
        <li>Second item</li>
      </ul>
      <figure>
        <img src="https://example.com/inline.jpg" alt="Inline image">
      </figure>
    </div>
  `;

  const blocks = parseContentBlocks(html);

  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "Section Title" },
    { type: "paragraph", text: "First line\nSecond line" },
    { type: "blockquote", text: "A quoted paragraph" },
    { type: "list", ordered: false, items: ["First item", "Second item"] },
    { type: "image", src: "https://example.com/inline.jpg", alt: "Inline image" }
  ]);
});

test("extractLeadImage prefers a meaningful page image and skips tracking assets", () => {
  const html = `
    <html>
      <head>
        <meta property="og:image" content="https://assets.genius.com/images/default_cover_image.png">
      </head>
      <body>
        <img src="https://pixel.quantserve.com/pixel.gif" alt="">
        <img src="https://images.example.com/cover.jpg" alt="Cover image">
      </body>
    </html>
  `;

  const leadImage = extractLeadImage(html, "https://example.com/article");

  assert.equal(leadImage?.src, "https://images.example.com/cover.jpg");
  assert.equal(leadImage?.alt, "Cover image");
});

test("writePdf includes contents, conversion metadata, source url, and page labels", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-link-pdf-"));
  const outputPath = path.join(tempDir, "sample.pdf");
  const document: ExtractedDocument = {
    title: "Sample Document",
    sourceUrl: "https://example.com/article",
    convertedAt: "2026-07-03T09:00:00.000Z",
    blocks: [
      { type: "heading", level: 2, text: "Section A" },
      { type: "paragraph", text: "A short paragraph" },
      { type: "heading", level: 2, text: "Section B" },
      { type: "paragraph", text: "Another paragraph with enough content to spill across lines." }
    ]
  };

  await writePdf(outputPath, document);

  const pdfBuffer = fs.readFileSync(outputPath);
  const pdfText = pdfBuffer.toString("latin1");

  assert.match(pdfText, /https:\/\/example\.com\/article/);
  assert.match(pdfText, /436f6e74656e7473/);
  assert.match(pdfText, /436f6e[\s\S]*7465643a/);
  assert.match(pdfText, /<50>\s*40\s*<6167652031>/);
});

test("writePdf does not explode page count on long multi-page documents", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-link-pdf-pages-"));
  const outputPath = path.join(tempDir, "long.pdf");
  const longParagraph = "This is a long paragraph used to force pagination. ".repeat(60);
  const blocks = Array.from({ length: 40 }, (_, index) => [
    { type: "heading", level: 2, text: `Section ${index + 1}` } as const,
    { type: "paragraph", text: longParagraph } as const
  ]).flat();

  const document: ExtractedDocument = {
    title: "Long Document",
    sourceUrl: "https://example.com/long",
    convertedAt: "2026-07-03T09:00:00.000Z",
    blocks
  };

  await writePdf(outputPath, document);

  const pdfInfo = execFileSync("pdfinfo", [outputPath], { encoding: "utf8" });
  const pagesMatch = pdfInfo.match(/Pages:\s+(\d+)/);

  assert.ok(pagesMatch, "pdfinfo should report a page count");
  const pages = Number(pagesMatch[1]);
  assert.ok(pages > 1, "long document should span multiple pages");
  assert.ok(pages < 80, `page count should stay reasonable, got ${pages}`);
});
