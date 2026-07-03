import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import type { ContentBlock, ExtractedDocument, LeadImage } from "./types.js";

function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function textWithLineBreaks(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return "";
  }

  const element = node as Element;

  if (element.tagName === "BR") {
    return "\n";
  }

  return Array.from(element.childNodes)
    .map((child) => textWithLineBreaks(child))
    .join("");
}

function cleanText(node: Node): string {
  return normalizeWhitespace(textWithLineBreaks(node));
}

function isMeaningfulImageUrl(src: string): boolean {
  const normalized = src.toLowerCase();

  return !(
    normalized.startsWith("data:") ||
    normalized.includes("pixel") ||
    normalized.includes("quantserve") ||
    normalized.includes("scorecardresearch") ||
    normalized.includes("doubleclick") ||
    normalized.includes("default_cover_image") ||
    normalized.endsWith(".gif")
  );
}

function makeAbsoluteUrl(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

function parseElement(element: Element, blocks: ContentBlock[]): void {
  const tagName = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tagName)) {
    const text = cleanText(element);
    if (text) {
      blocks.push({ type: "heading", level: Number(tagName[1]), text });
    }
    return;
  }

  if (tagName === "p") {
    const text = cleanText(element);
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    return;
  }

  if (tagName === "blockquote") {
    const text = cleanText(element);
    if (text) {
      blocks.push({ type: "blockquote", text });
    }
    return;
  }

  if (tagName === "ul" || tagName === "ol") {
    const items = Array.from(element.querySelectorAll(":scope > li"))
      .map((item) => cleanText(item))
      .filter(Boolean);

    if (items.length > 0) {
      blocks.push({ type: "list", ordered: tagName === "ol", items });
    }
    return;
  }

  if (tagName === "img") {
    const src = element.getAttribute("src");
    if (src) {
      blocks.push({
        type: "image",
        src,
        alt: (element.getAttribute("alt") ?? "").trim()
      });
    }
    return;
  }

  if (tagName === "hr") {
    blocks.push({ type: "rule" });
    return;
  }

  for (const child of Array.from(element.children)) {
    parseElement(child, blocks);
  }
}

export function parseContentBlocks(contentHtml: string): ContentBlock[] {
  const dom = new JSDOM(`<body>${contentHtml}</body>`);
  const blocks: ContentBlock[] = [];

  for (const child of Array.from(dom.window.document.body.children)) {
    parseElement(child, blocks);
  }

  return blocks;
}

export function extractLeadImage(html: string, baseUrl: string): LeadImage | null {
  const dom = new JSDOM(html, { url: baseUrl });
  const { document } = dom.window;

  const candidates: LeadImage[] = [];

  for (const selector of [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    "img"
  ]) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rawSrc =
        element.getAttribute("content") ??
        element.getAttribute("src") ??
        "";
      const src = makeAbsoluteUrl(rawSrc.trim(), baseUrl);
      const alt = (element.getAttribute("alt") ?? "").trim();

      if (src && isMeaningfulImageUrl(src)) {
        candidates.push({ src, alt });
      }
    }
  }

  const deduped = candidates.filter(
    (candidate, index) =>
      candidates.findIndex((item) => item.src === candidate.src) === index
  );

  return deduped[0] ?? null;
}

export function extractDocument(html: string, url: string): ExtractedDocument {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article?.content?.trim()) {
    throw new Error("Unable to extract readable content from this page.");
  }

  const blocks = parseContentBlocks(article.content).map((block) => {
    if (block.type !== "image") {
      return block;
    }

    return { ...block, src: makeAbsoluteUrl(block.src, url) };
  });

  const leadImage = extractLeadImage(html, url);
  const hasImages = blocks.some((block) => block.type === "image");

  if (!hasImages && leadImage) {
    blocks.unshift({ type: "image", src: leadImage.src, alt: leadImage.alt });
  }

  return {
    title: article.title?.trim() || "Untitled Document",
    sourceUrl: url,
    convertedAt: new Date().toISOString(),
    blocks
  };
}
