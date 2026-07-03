import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

import type { ContentBlock, ExtractedDocument } from "./types.js";

function formatConversionDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date) + " UTC";
}

function collectTableOfContents(blocks: ContentBlock[]): Array<{ level: number; text: string }> {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "heading" }> => block.type === "heading")
    .map((block) => ({ level: block.level, text: block.text }));
}

function renderTableOfContents(
  doc: PDFKit.PDFDocument,
  entries: Array<{ level: number; text: string }>
): void {
  if (entries.length === 0) {
    return;
  }

  doc.font("Helvetica-Bold").fontSize(16).text("Contents");
  doc.moveDown(0.4);

  for (const entry of entries) {
    const indent = Math.max(0, entry.level - 1) * 12;
    doc.font("Helvetica").fontSize(11).text(entry.text, {
      indent,
      lineGap: 2
    });
  }

  doc.moveDown();
}

async function fetchImageBuffer(src: string): Promise<Buffer> {
  const response = await fetch(src, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ConvertContentLinkToPdf/1.0; +https://github.com/)"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch image: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function renderRule(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor("#bbbbbb")
    .lineWidth(1)
    .stroke();
  doc.moveDown();
  doc.strokeColor("#000000");
}

function drawHeaderFooter(
  doc: PDFKit.PDFDocument,
  document: ExtractedDocument,
  pageNumber: number
): void {
  const previousX = doc.x;
  const previousY = doc.y;
  const { width, height, margins } = doc.page;
  const headerY = 28;
  const footerY = height - margins.bottom - 8;
  const truncatedTitle =
    document.title.length > 72 ? `${document.title.slice(0, 69)}...` : document.title;
  const footerLeft = `Converted: ${formatConversionDate(document.convertedAt)}`;
  const footerRight = `Page ${pageNumber}`;

  doc.save();
  doc.font("Helvetica").fontSize(9).fillColor("#666666");
  doc.text(truncatedTitle, margins.left, headerY, {
    width: width - margins.left - margins.right,
    align: "left",
    lineBreak: false
  });
  doc.text(document.sourceUrl, margins.left, footerY, {
    width: width - margins.left - margins.right,
    align: "left",
    lineBreak: false,
    link: document.sourceUrl,
    underline: false
  });
  doc.text(footerLeft, margins.left, footerY - 12, {
    width: width - margins.left - margins.right,
    align: "left",
    lineBreak: false
  });
  doc.text(footerRight, margins.left, footerY - 12, {
    width: width - margins.left - margins.right,
    align: "right",
    lineBreak: false
  });
  doc.x = previousX;
  doc.y = previousY;
  doc.restore();
}

async function renderImageBlock(doc: PDFKit.PDFDocument, block: Extract<ContentBlock, { type: "image" }>): Promise<void> {
  try {
    const imageBuffer = await fetchImageBuffer(block.src);
    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const maxHeight = doc.page.height * 0.35;

    doc.image(imageBuffer, {
      fit: [maxWidth, maxHeight],
      align: "center",
      valign: "center"
    });

    if (block.alt) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#666666").text(block.alt, {
        align: "center"
      });
      doc.fillColor("#000000");
    }

    doc.moveDown();
  } catch {
    if (block.alt) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666666").text(`[Image omitted: ${block.alt}]`);
      doc.fillColor("#000000");
      doc.moveDown();
    }
  }
}

async function renderBlock(doc: PDFKit.PDFDocument, block: ContentBlock): Promise<void> {
  switch (block.type) {
    case "heading": {
      const fontSize = Math.max(13, 22 - block.level * 2);
      doc.font("Helvetica-Bold").fontSize(fontSize).text(block.text);
      doc.moveDown(0.5);
      return;
    }
    case "paragraph":
      doc.font("Helvetica").fontSize(12).text(block.text, { lineGap: 4 });
      doc.moveDown();
      return;
    case "blockquote":
      doc.font("Helvetica-Oblique").fontSize(11).fillColor("#333333").text(block.text, {
        indent: 18,
        lineGap: 4
      });
      doc.fillColor("#000000");
      doc.moveDown();
      return;
    case "list":
      doc.font("Helvetica").fontSize(12);
      block.items.forEach((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : "•";
        doc.text(`${marker} ${item}`, { indent: 12, lineGap: 3 });
      });
      doc.moveDown();
      return;
    case "image":
      await renderImageBlock(doc, block);
      return;
    case "rule":
      renderRule(doc);
      return;
  }
}

export async function writePdf(outputPath: string, document: ExtractedDocument): Promise<void> {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 64,
        bottom: 64,
        left: 56,
        right: 56
      },
      autoFirstPage: true,
      compress: false
    });
    let pageNumber = 1;
    let isDecoratingPage = false;

    const stream = fs.createWriteStream(outputPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    (async () => {
      doc.info.Title = document.title;
      doc.info.Subject = "Converted web content PDF";
      doc.info.Author = document.sourceUrl;
      doc.info.Keywords = "pdf, web content, conversion";

      doc.on("pageAdded", () => {
        if (isDecoratingPage) {
          return;
        }
        pageNumber += 1;
        isDecoratingPage = true;
        drawHeaderFooter(doc, document, pageNumber);
        isDecoratingPage = false;
      });

      doc.font("Helvetica-Bold").fontSize(20).text(document.title);
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(10).fillColor("#555555").text(document.sourceUrl, {
        link: document.sourceUrl,
        underline: true
      });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).text(`Converted: ${formatConversionDate(document.convertedAt)}`);
      doc.fillColor("#000000");
      doc.moveDown();

      renderTableOfContents(doc, collectTableOfContents(document.blocks));

      for (const block of document.blocks) {
        await renderBlock(doc, block);
      }

      isDecoratingPage = true;
      drawHeaderFooter(doc, document, 1);
      isDecoratingPage = false;
      doc.end();
    })().catch(reject);
  });
}
