export interface PaperMetadata {
  title: string;
  authors: string;
  year: string;
  abstractNote: string;
  journal: string;
  fileName: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

export interface SiteProfile {
  id: string;
  name: string;
  url: string;
  ready: string;
  optionalNewChatButton: string;
  optionalLocalFileMenuItem: string;
  fileInput: string;
  promptInput: string;
  sendButton: string;
  optionalUploadButton: string;
  enabled: boolean;
  isBuiltin?: boolean;
}

export interface LaunchContext {
  item: Zotero.Item;
  attachment: Zotero.Item;
  pdfPath: string;
  metadata: PaperMetadata;
  siteProfile: SiteProfile;
  promptText: string;
}

export interface BrowserAutomationResult {
  ok: boolean;
  automated: boolean;
  message: string;
  openedUrl: string;
}

export interface AttachmentCandidate {
  id: number;
  contentType: string;
  path?: string | null;
}
