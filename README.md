# Convert Content Link to PDF

Small TypeScript and Node.js app that downloads web pages, extracts their main content, and saves clean PDFs.

## Install

```bash
npm install
```

## Usage

Start the web app:

```bash
npm run web
```

Then open `http://localhost:3000`.

Paste one link to download a single PDF, or paste several links to download a ZIP containing all generated PDFs.

CLI usage:

```bash
npm run convert -- "https://example.com/article"
```

Optional output file:

```bash
npm run convert -- "https://example.com/article" "./output/my-file.pdf"
```

The generated PDF is saved in `output/` by default.

## Notes

- Best for article-like pages where the main text is clearly identifiable.
- Some websites may block automated requests or load content dynamically in the browser.

## Daily Project Journal

Create daily project journal content, make two real commits on `main`, and push them:

```bash
npm run journal:daily
```

Install the local macOS automation that runs it every day at 20:30:

```bash
bash scripts/install-daily-journal-launchd.sh
```

The first commit records test/build health. The second commit records generated maintenance notes derived from the repository state.

The script refuses to run if the working tree is dirty, so it will not commit unrelated work in progress.
