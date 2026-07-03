import test from "node:test";
import assert from "node:assert/strict";

import { createNumberedPdfFileName } from "./file-names.js";

test("createNumberedPdfFileName prefixes the extracted page title with its batch position", () => {
  const usedNames = new Set<string>();

  const fileName = createNumberedPdfFileName(2, "Sam Altman - Lecture 1: How to Start a Startup", usedNames);

  assert.equal(fileName, "2 - sam-altman-lecture-1-how-to-start-a-startup.pdf");
});

test("createNumberedPdfFileName keeps names unique when titles repeat", () => {
  const usedNames = new Set<string>();

  const firstName = createNumberedPdfFileName(1, "Same Title", usedNames);
  const secondName = createNumberedPdfFileName(1, "Same Title", usedNames);

  assert.equal(firstName, "1 - same-title.pdf");
  assert.equal(secondName, "1 - same-title-2.pdf");
});
