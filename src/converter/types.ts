export type ContentBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" };

export type ExtractedDocument = {
  title: string;
  sourceUrl: string;
  convertedAt: string;
  blocks: ContentBlock[];
};

export type LeadImage = {
  src: string;
  alt: string;
};
