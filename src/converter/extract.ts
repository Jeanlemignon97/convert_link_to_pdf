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
    normalized.includes("default_banner") ||
    normalized.includes("sharing_fallback") ||
    normalized.includes("placeholder") ||
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

function readImageSource(element: Element): string {
  const directSources = [
    element.getAttribute("content"),
    element.getAttribute("src"),
    element.getAttribute("data-src"),
    element.getAttribute("data-lazy-src"),
    element.getAttribute("data-image")
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);

  if (directSources.length > 0) {
    return directSources[0];
  }

  const srcset = element.getAttribute("srcset")?.trim() ?? "";
  if (!srcset) {
    return "";
  }

  return srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0] ?? "")
    .find(Boolean) ?? "";
}

function decodeStructuredImageUrl(rawUrl: string): string {
  return rawUrl
    .replace(/\\\//g, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function readStructuredImageSources(html: string): Array<{ src: string; score: number }> {
  const sources: Array<{ src: string; score: number }> = [];
  const imageUrlPattern =
    /\\?"(headerImageUrl|imageUrl|songArtImageUrl|coverArtUrl|coverArtThumbnailUrl)\\?"\s*:\s*\\?"((?:\\\\.|[^"\\])+)\\?"/g;

  for (const match of html.matchAll(imageUrlPattern)) {
    const key = match[1];
    const src = decodeStructuredImageUrl(match[2] ?? "");

    if (!src || !isMeaningfulImageUrl(src)) {
      continue;
    }

    const score = /header|cover|songArt/i.test(key) ? 85 : 70;
    sources.push({ src, score });
  }

  return sources;
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
    const src = readImageSource(element);
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

  const candidates: Array<LeadImage & { score: number; index: number }> = [];
  let index = 0;

  const scoreImage = (element: Element, src: string, alt: string): number => {
    const normalizedSrc = src.toLowerCase();
    const normalizedAlt = alt.toLowerCase();
    const context = [
      element.getAttribute("class") ?? "",
      element.getAttribute("id") ?? "",
      element.getAttribute("data-testid") ?? "",
      element.parentElement?.getAttribute("class") ?? "",
      element.parentElement?.getAttribute("id") ?? "",
      element.parentElement?.getAttribute("data-testid") ?? ""
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;

    if (alt.trim()) {
      score += 20;
    }

    if (/(cover|author|avatar|profile|hero|header|art)/.test(normalizedAlt)) {
      score += 40;
    }

    if (/(cover|author|avatar|profile|hero|header|art|image|photo)/.test(normalizedSrc)) {
      score += 20;
    }

    if (/(cover|author|avatar|profile|hero|header|song-header)/.test(context)) {
      score += 30;
    }

    if (/(fallback|placeholder|default|sprite|logo)/.test(normalizedSrc) && !alt.trim()) {
      score -= 50;
    }

    return score;
  };

  for (const selector of [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    "img"
  ]) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rawSrc = readImageSource(element);
      if (!rawSrc) {
        continue;
      }
      const src = makeAbsoluteUrl(rawSrc.trim(), baseUrl);
      const alt = (element.getAttribute("alt") ?? "").trim();

      if (src && isMeaningfulImageUrl(src)) {
        candidates.push({
          src,
          alt,
          score: scoreImage(element, src, alt),
          index: index++
        });
      }
    }
  }

  for (const structuredSource of readStructuredImageSources(html)) {
    candidates.push({
      src: makeAbsoluteUrl(structuredSource.src, baseUrl),
      alt: "",
      score: structuredSource.score,
      index: index++
    });
  }

  const deduped = candidates.filter(
    (candidate, index) =>
      candidates.findIndex((item) => item.src === candidate.src) === index
  );

  deduped.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.index - right.index;
  });

  const best = deduped[0];

  return best ? { src: best.src, alt: best.alt } : null;
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
  const hasLeadImage = leadImage
    ? blocks.some((block) => block.type === "image" && block.src === leadImage.src)
    : false;

  if (leadImage && !hasLeadImage) {
    blocks.unshift({ type: "image", src: leadImage.src, alt: leadImage.alt });
  }

  return {
    title: article.title?.trim() || "Untitled Document",
    sourceUrl: url,
    convertedAt: new Date().toISOString(),
    blocks
  };
}
