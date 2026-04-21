import { getDefaultPromptTemplate } from "./profiles";
import { PaperMetadata } from "./types";

export function renderPromptTemplate(
  template: string,
  metadata: PaperMetadata,
) {
  return template
    .replaceAll("{{title}}", metadata.title || "")
    .replaceAll("{{authors}}", metadata.authors || "")
    .replaceAll("{{year}}", metadata.year || "")
    .replaceAll("{{abstract}}", metadata.abstractNote || "")
    .replaceAll("{{journal}}", metadata.journal || "")
    .replaceAll("{{fileName}}", metadata.fileName || "");
}

export function buildPrompt(metadata: PaperMetadata) {
  return renderPromptTemplate(getDefaultPromptTemplate(), metadata);
}
