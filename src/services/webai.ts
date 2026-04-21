import { getShowUsageHints } from "./profiles";
import { createBrowserController, getBridgeUsageHint } from "./browser";
import { resolveLaunchContext } from "./paper";

export async function askCurrentSelectionInWebAI(
  siteId?: string,
  options?: {
    promptText?: string;
  },
) {
  return runWebAIFlow("selection", siteId, options);
}

export async function askCurrentReaderInWebAI(
  siteId?: string,
  options?: {
    promptText?: string;
  },
) {
  return runWebAIFlow("reader", siteId, options);
}

export async function runWebAIFlow(
  source: "selection" | "reader",
  siteId?: string,
  options?: {
    promptText?: string;
  },
) {
  const progress = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: "Preparing PDF context...",
      progress: 10,
    })
    .show();

  try {
    const context = await resolveLaunchContext({
      source,
      siteId,
      promptText: options?.promptText,
    });
    progress.changeLine({
      text: `Opening ${context.siteProfile.name} in Chrome...`,
      progress: 45,
    });
    const controller = createBrowserController();
    const result = await controller.open(context);
    progress.changeLine({
      text: result.message,
      progress: 100,
      type: result.ok ? "success" : "default",
    });
    progress.startCloseTimer(6000);
    if (getShowUsageHints()) {
      showHint(
        `${context.siteProfile.name} was opened in Chrome.\n\n` +
          `PDF: ${context.metadata.fileName}\n\n` +
          `${getBridgeUsageHint()}\n\n` +
          `If the companion extension is installed, it will upload the PDF and fill the prompt automatically.`,
      );
    }
    return result;
  } catch (error) {
    progress.changeLine({
      text: formatErrorMessage(error),
      progress: 100,
      type: "error",
    });
    progress.startCloseTimer(8000);
    showError(formatErrorMessage(error));
    throw error;
  }
}

function showHint(message: string) {
  const window = Zotero.getMainWindow();
  Zotero.alert(window, addon.data.config.addonName, message);
}

function showError(message: string) {
  const window = Zotero.getMainWindow();
  Zotero.alert(window, `${addon.data.config.addonName} Error`, message);
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
