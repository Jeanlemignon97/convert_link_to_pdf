# Convert Content Link to PDF

Small TypeScript CLI that downloads a web page, extracts its main content, and saves it as a clean PDF.

## Install

```bash
npm install
```

## Usage

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
