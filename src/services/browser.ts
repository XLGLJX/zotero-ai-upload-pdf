import { getChromeAppPath, getShowUsageHints } from "./profiles";
import { BrowserAutomationResult, LaunchContext } from "./types";

export interface BrowserController {
  open(context: LaunchContext): Promise<BrowserAutomationResult>;
}

interface EncodedTaskPayload {
  pdfPath: string;
  promptText: string;
  siteProfile: LaunchContext["siteProfile"];
}

export function createBrowserController(): BrowserController {
  if (Zotero.isMac) {
    return new MacOSChromeExtensionController();
  }
  return new GenericBrowserController();
}

class MacOSChromeExtensionController implements BrowserController {
  async open(context: LaunchContext): Promise<BrowserAutomationResult> {
    const payload = encodeTaskPayload({
      pdfPath: context.pdfPath,
      promptText: context.promptText,
      siteProfile: context.siteProfile,
    });
    const targetUrl = buildTaskUrl(context.siteProfile.url, payload);
    await openUrlInChrome(targetUrl);
    return {
      ok: true,
      automated: true,
      openedUrl: context.siteProfile.url,
      message:
        "Chrome was opened with a one-time task payload. If the companion extension is installed and enabled, it will upload the PDF and fill the prompt automatically.",
    };
  }
}

class GenericBrowserController implements BrowserController {
  async open(context: LaunchContext): Promise<BrowserAutomationResult> {
    const payload = encodeTaskPayload({
      pdfPath: context.pdfPath,
      promptText: context.promptText,
      siteProfile: context.siteProfile,
    });
    const targetUrl = buildTaskUrl(context.siteProfile.url, payload);
    await openUrlInSystemBrowser(targetUrl);
    return {
      ok: true,
      automated: false,
      openedUrl: context.siteProfile.url,
      message:
        "The page was opened with a one-time task payload. Automatic upload requires opening it in Chrome with the companion extension installed.",
    };
  }
}

export function checkChromeSetup() {
  const appPath = getChromeAppPath();
  if (!appPath.trim()) {
    throw new Error("Chrome app path is empty.");
  }
  return appPath;
}

export function getBridgeUsageHint() {
  const coreHint =
    "This plugin now uses a one-time task payload in the opened Chrome URL, and the companion extension clears that payload immediately after reading it.";
  if (!getShowUsageHints()) {
    return coreHint;
  }
  return (
    coreHint +
    " Load the unpacked extension from the chrome-extension folder in chrome://extensions."
  );
}

function buildTaskUrl(baseUrl: string, payload: string) {
  const url = new URL(baseUrl);
  url.hash = `zotero-webai-task=${encodeURIComponent(payload)}`;
  return url.toString();
}

function encodeTaskPayload(payload: EncodedTaskPayload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", ".");
}

async function openUrlInChrome(url: string) {
  const appPath = getChromeAppPath();
  await Zotero.Utilities.Internal.exec("/usr/bin/open", ["-a", appPath, url]);
}

async function openUrlInSystemBrowser(url: string) {
  const launchURL = (
    Zotero as typeof Zotero & {
      launchURL?: (target: string) => void;
    }
  ).launchURL;
  if (typeof launchURL === "function") {
    launchURL(url);
    return;
  }
  await openUrlInChrome(url);
}
