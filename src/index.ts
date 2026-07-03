import { extractDocument, resolveOutputPath, writePdf } from "./converter.js";

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

async function fetchHtml(url: string): Promise<string> {
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

async function main(): Promise<void> {
  const { url, outputPath } = parseArgs(process.argv.slice(2));
  const html = await fetchHtml(url);
  const document = extractDocument(html, url);
  const finalOutputPath = resolveOutputPath(document.title, outputPath);

  await writePdf(finalOutputPath, document);

  console.log(`PDF created: ${finalOutputPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
