import test from "node:test";
import assert from "node:assert/strict";

import { extractLinks, mergeLinks } from "./links.js";

test("extractLinks reads urls from pasted text with common separators", () => {
  const links = extractLinks(`
    https://example.com/one,
    some text https://example.com/two;
    https://example.com/three.
  `);

  assert.deepEqual(links, [
    "https://example.com/one",
    "https://example.com/two",
    "https://example.com/three"
  ]);
});

test("mergeLinks deduplicates pasted and field links", () => {
  const links = mergeLinks("https://example.com/a", [
    "https://example.com/a",
    "https://example.com/b"
  ]);

  assert.deepEqual(links, [
    "https://example.com/a",
    "https://example.com/b"
  ]);
});
