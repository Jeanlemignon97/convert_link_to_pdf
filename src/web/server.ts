import { ZipArchive, type ArchiverError } from "archiver";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createNumberedPdfFileName } from "../batch/file-names.js";
import { mergeLinks } from "../batch/links.js";
import { convertUrlToPdf } from "../converter.js";
import { shouldSendZip } from "./response-policy.js";

type ConvertRequest = {
  input?: string;
  links?: string[];
  forceZip?: boolean;
};

type ConversionResult = {
  url: string;
  fileName: string;
  filePath: string;
};

type ConversionFailure = {
  url: string;
  message: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(projectRoot, "public");
const maxLinksPerBatch = 50;

function cleanup(directory: string): void {
  fs.rm(directory, { recursive: true, force: true }, () => undefined);
}

async function convertLinks(links: string[], tempDir: string): Promise<{
  failures: ConversionFailure[];
  results: ConversionResult[];
}> {
  const usedNames = new Set<string>();
  const results: ConversionResult[] = [];
  const failures: ConversionFailure[] = [];

  for (const [index, url] of links.entries()) {
    const temporaryFilePath = path.join(tempDir, `document-${index + 1}.pdf`);

    try {
      const conversion = await convertUrlToPdf(url, temporaryFilePath);
      const fileName = createNumberedPdfFileName(index + 1, conversion.title, usedNames);
      results.push({ url, fileName, filePath: conversion.outputPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failures.push({ url, message });
    }
  }

  return { failures, results };
}

function sendZip(
  response: express.Response,
  tempDir: string,
  results: ConversionResult[],
  failures: ConversionFailure[]
): void {
  const archive = new ZipArchive({ zlib: { level: 9 } });

  response.attachment("converted-content-pdfs.zip");
  archive.on("error", (error: ArchiverError) => response.destroy(error));
  response.on("close", () => cleanup(tempDir));
  archive.pipe(response);

  for (const result of results) {
    archive.file(result.filePath, { name: result.fileName });
  }

  if (failures.length > 0) {
    const report = failures
      .map((failure) => `${failure.url}\n${failure.message}`)
      .join("\n\n");
    archive.append(report, { name: "errors.txt" });
  }

  archive.finalize().catch((error: unknown) => {
    response.destroy(error instanceof Error ? error : new Error("Unable to finalize zip"));
  });
}

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

app.post("/api/convert", async (request, response) => {
  const body = request.body as ConvertRequest;
  const links = mergeLinks(body.input ?? "", body.links ?? []);

  if (links.length === 0) {
    response.status(400).json({ error: "Ajoute au moins un lien valide." });
    return;
  }

  if (links.length > maxLinksPerBatch) {
    response.status(400).json({ error: `Maximum ${maxLinksPerBatch} liens par export.` });
    return;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "convert-content-pdf-"));
  const { failures, results } = await convertLinks(links, tempDir);

  if (results.length === 0) {
    cleanup(tempDir);
    response.status(502).json({
      error: "Aucun PDF n'a pu etre genere.",
      failures
    });
    return;
  }

  const forceZip = Boolean(body.forceZip);

  if (!shouldSendZip(results.length, failures.length, forceZip) && results.length === 1) {
    const [result] = results;
    response.download(result.filePath, result.fileName, () => cleanup(tempDir));
    return;
  }

  sendZip(response, tempDir, results, failures);
});

app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (request.method !== "GET") {
    next();
    return;
  }

  response.sendFile(path.join(publicDir, "index.html"));
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Convert Content Link to PDF is running on http://localhost:${port}`);
});
