import test from "node:test";
import assert from "node:assert/strict";

import { shouldSendZip } from "./response-policy.js";

test("shouldSendZip sends zip when forced", () => {
  assert.equal(shouldSendZip(1, 0, true), true);
});

test("shouldSendZip sends zip for batch or partial failure", () => {
  assert.equal(shouldSendZip(2, 0, false), true);
  assert.equal(shouldSendZip(1, 1, false), true);
});

test("shouldSendZip keeps a single successful conversion as a pdf", () => {
  assert.equal(shouldSendZip(1, 0, false), false);
});
