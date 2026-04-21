import { getSiteProfileById } from "./profiles";
import { buildPrompt, renderPromptTemplate } from "./prompt";
import { AttachmentCandidate, LaunchContext, PaperMetadata } from "./types";

export async function resolveLaunchContext(options: {
  source: "selection" | "reader";
  siteId?: string;
  promptText?: string;
}): Promise<LaunchContext> {
  const profile = getSiteProfileById(options.siteId);
  if (!profile) {
    throw new Error("No enabled Web AI site profile is available.");
  }

  const sourceItem =
    options.source === "reader"
      ? getCurrentReaderItem()
      : getCurrentSelectionItem() || getCurrentReaderItem();
  if (!sourceItem) {
    throw new Error("No current item or PDF is available.");
  }

  const { item, attachment, pdfPath } = await resolvePdfForItem(sourceItem);
  const metadata = buildMetadata(item, attachment, pdfPath);
  return {
    item,
    attachment,
    pdfPath,
    metadata,
    siteProfile: profile,
    promptText:
      options.promptText !== undefined
        ? renderPromptTemplate(options.promptText, metadata)
        : buildPrompt(metadata),
  };
}

export function pickLocalPdfCandidate(candidates: AttachmentCandidate[]) {
  return (
    candidates.find(
      (candidate) =>
        candidate.contentType === "application/pdf" && Boolean(candidate.path),
    ) || null
  );
}

export function buildMetadata(
  item: Zotero.Item,
  attachment: Zotero.Item,
  pdfPath: string,
): PaperMetadata {
  const title = String(item.getField("title") || attachment.getField("title"));
  const journal = String(
    item.getField("publicationTitle") ||
      item.getField("proceedingsTitle") ||
      item.getField("bookTitle") ||
      "",
  );
  const abstractNote = String(item.getField("abstractNote") || "");
  const authors = formatAuthors(item);
  const year = extractYear(item);
  const fileName = pdfPath.split("/").pop() || pdfPath;

  return {
    title,
    authors,
    year,
    abstractNote,
    journal,
    fileName,
  };
}

export function getCurrentSelectionItem() {
  const pane = Zotero.getActiveZoteroPane();
  const items = pane?.getSelectedItems?.() || [];
  return items[0] as Zotero.Item | undefined;
}

export function getCurrentReaderItem() {
  const Zotero_Tabs = ztoolkit.getGlobal("Zotero_Tabs");
  const selectedTabID = Zotero_Tabs?.selectedID;
  if (!selectedTabID || selectedTabID === "zotero-pane") {
    return undefined;
  }
  const reader = Zotero.Reader.getByTabID(selectedTabID);
  if (!reader?.itemID) {
    return undefined;
  }
  return Zotero.Items.get(reader.itemID) as Zotero.Item | undefined;
}

async function resolvePdfForItem(item: Zotero.Item) {
  if (
    item.isAttachment() &&
    item.attachmentContentType === "application/pdf" &&
    (await item.getFilePathAsync())
  ) {
    const parentItem = item.parentID
      ? ((await Zotero.Items.getAsync(item.parentID)) as Zotero.Item)
      : item;
    return {
      item: parentItem,
      attachment: item,
      pdfPath: (await item.getFilePathAsync()) as string,
    };
  }

  const regularItem =
    item.isAttachment() && item.parentID
      ? ((await Zotero.Items.getAsync(item.parentID)) as Zotero.Item)
      : item;

  if (!regularItem.isRegularItem()) {
    throw new Error(
      "The selected item is not a regular item with a local PDF.",
    );
  }

  const attachmentIDs = regularItem.getAttachments();
  const candidates: Array<AttachmentCandidate & { attachment: Zotero.Item }> =
    [];
  for (const attachmentID of attachmentIDs) {
    const attachment = (await Zotero.Items.getAsync(
      attachmentID,
    )) as Zotero.Item;
    const path = (await attachment.getFilePathAsync()) || null;
    candidates.push({
      id: attachment.id,
      contentType: attachment.attachmentContentType || "",
      path,
      attachment,
    });
  }

  const picked = pickLocalPdfCandidate(candidates);
  if (!picked) {
    throw new Error("No local PDF attachment was found for the current item.");
  }

  const attachment = candidates.find(
    (candidate) => candidate.id === picked.id,
  )?.attachment;
  if (!attachment || !picked.path) {
    throw new Error("The PDF attachment could not be resolved.");
  }

  return {
    item: regularItem,
    attachment,
    pdfPath: picked.path,
  };
}

function formatAuthors(item: Zotero.Item) {
  const creators = item.getCreators();
  return creators
    .map((creator) =>
      [creator.firstName, creator.lastName].filter(Boolean).join(" "),
    )
    .filter(Boolean)
    .join(", ");
}

function extractYear(item: Zotero.Item) {
  const year = String(item.getField("year") || "").trim();
  if (year) {
    return year;
  }
  const date = String(item.getField("date") || "");
  const matched = date.match(/\b(19|20)\d{2}\b/);
  return matched?.[0] || "";
}
