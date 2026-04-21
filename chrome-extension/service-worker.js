chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "zotero-webai-task" || !sender.tab?.id) {
    return;
  }
  void handleTaskPayload(sender.tab.id, message.payload);
});

async function handleTaskPayload(tabId, payload) {
  let attached = false;
  try {
    const task = decodeTaskPayload(payload);
    await attachDebugger(tabId);
    attached = true;
    await sendCommand(tabId, "Page.enable");
    await sendCommand(tabId, "Runtime.enable");
    await sendCommand(tabId, "DOM.enable");
    await waitForSelector(tabId, task.siteProfile.ready);
    if (task.siteProfile.optionalNewChatButton) {
      const startedFresh = await clickIfPresent(
        tabId,
        task.siteProfile.optionalNewChatButton,
      );
      if (startedFresh) {
        await delay(800);
        await waitForSelector(tabId, task.siteProfile.ready);
      }
    }
    await uploadPdf(tabId, task.siteProfile, task.pdfPath).catch(
      async (error) => {
        const recovered = await recoverFromKnownUploadIssue(
          tabId,
          task.siteProfile.id,
          error,
        );
        if (!recovered) {
          throw error;
        }
      },
    );
    await dismissKnownBlockingDialogs(tabId, task.siteProfile.id);
    if (String(task.promptText || "").trim()) {
      await fillPrompt(
        tabId,
        task.siteProfile.id,
        task.siteProfile.promptInput,
        task.promptText,
      );
      await dismissKnownBlockingDialogs(tabId, task.siteProfile.id);
      await waitForSelector(tabId, task.siteProfile.sendButton);
      await focus(tabId, task.siteProfile.sendButton);
    } else {
      await focus(tabId, task.siteProfile.promptInput).catch(() => undefined);
    }
  } catch (error) {
    console.error("AI-upload-pdf automation failed", error);
  } finally {
    if (attached) {
      await detachDebugger(tabId);
    }
  }
}

async function recoverFromKnownUploadIssue(tabId, siteId, error) {
  if (siteId !== "chatgpt") {
    return false;
  }

  const message = formatError(error).toLowerCase();
  const duplicateDialogVisible = await detectChatGPTDuplicateFileDialog(tabId);
  if (
    !duplicateDialogVisible &&
    !message.includes("upload") &&
    !message.includes("file chooser") &&
    !message.includes("file input")
  ) {
    return false;
  }

  if (!duplicateDialogVisible) {
    return false;
  }

  const dismissed = await dismissChatGPTDuplicateFileDialog(tabId);
  if (!dismissed) {
    return false;
  }

  await delay(300);
  return true;
}

async function dismissKnownBlockingDialogs(tabId, siteId) {
  if (siteId !== "chatgpt") {
    return false;
  }
  const visible = await detectChatGPTDuplicateFileDialog(tabId);
  if (!visible) {
    return false;
  }
  const dismissed = await dismissChatGPTDuplicateFileDialog(tabId);
  if (!dismissed) {
    return false;
  }
  await waitForChatGPTDuplicateDialogToDisappear(tabId);
  return true;
}

function decodeTaskPayload(payload) {
  const normalized = payload
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .replaceAll(".", "=");
  const json = decodeURIComponent(escape(atob(normalized)));
  return JSON.parse(json);
}

async function attachDebugger(tabId) {
  await chrome.debugger.attach({ tabId }, "1.3");
}

async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    console.warn("Failed to detach debugger", error);
  }
}

async function sendCommand(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function waitForSelector(tabId, selector, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const exists = await evaluate(
      tabId,
      buildDeepQueryBooleanExpression(selector),
    );
    if (exists) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function clickIfPresent(tabId, selector) {
  if (!selector || !selector.trim()) {
    return false;
  }
  const clicked = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const el = __zoteroWebAIDeepQuery(document, ${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView?.({ block: "center", inline: "center" });
      el.click();
      return true;
    })()`,
  );
  if (clicked) {
    await delay(300);
  }
  return clicked;
}

async function nativeClickIfPresent(tabId, selector) {
  if (!selector || !selector.trim()) {
    return false;
  }
  const point = await getClickablePoint(tabId, selector);
  if (!point) {
    return false;
  }
  await clickViewportPoint(tabId, point.x, point.y);
  await delay(300);
  return true;
}

async function clickForSite(tabId, siteId, selector) {
  void siteId;
  if (siteId === "chatgpt") {
    return clickIfPresent(tabId, selector);
  }
  return clickIfPresent(tabId, selector);
}

async function uploadFile(tabId, selector, filePath) {
  let objectId;
  try {
    objectId = await getObjectId(tabId, selector);
    await sendCommand(tabId, "DOM.setFileInputFiles", {
      objectId,
      files: [filePath],
    });
    await dispatchFileEvents(tabId, selector);
    await delay(500);
  } catch (error) {
    throw new Error(
      `Failed to upload file for selector ${selector}: ${formatError(error)}`,
    );
  } finally {
    if (objectId) {
      await releaseObject(tabId, objectId);
    }
  }
}

async function uploadPdf(tabId, siteProfile, filePath) {
  let directUploadError;
  try {
    await waitForSelector(tabId, siteProfile.fileInput, 4000);
    await uploadFile(tabId, siteProfile.fileInput, filePath);
    return;
  } catch (error) {
    directUploadError = error;
  }

  if (!siteProfile.optionalUploadButton) {
    throw directUploadError;
  }

  try {
    await waitForSelectorMaybe(tabId, siteProfile.optionalUploadButton, 6000);
    await uploadViaFileChooser(
      tabId,
      siteProfile.id,
      siteProfile.optionalLocalFileMenuItem,
      siteProfile.fileInput,
      siteProfile.optionalUploadButton,
      filePath,
    );
  } catch (fallbackError) {
    throw new Error(
      `Direct file input upload failed: ${formatError(
        directUploadError,
      )}; file chooser fallback failed: ${formatError(fallbackError)}`,
    );
  }
}

async function fillPrompt(tabId, siteId, selector, text) {
  const result = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(
        getPromptSelectorsForSite(siteId, selector),
      )};
      let element = null;
      for (const candidateSelector of selectors) {
        element = __zoteroWebAIDeepQuery(document, candidateSelector);
        if (element) break;
      }
      if (!element) return { ok: false, reason: "Prompt input not found" };
      element.scrollIntoView?.({ block: "center", inline: "nearest" });
      element.focus();
      const value = ${JSON.stringify(text)};
      if ("value" in element) {
        const prototype =
          element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : element instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : null;
        const setter = prototype
          ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
          : null;
        if (setter) {
          setter.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      if (element.isContentEditable) {
        element.textContent = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      return { ok: false, reason: "Prompt input is not editable" };
    })()`,
  );
  const filled =
    result.ok && (await isPromptFilled(tabId, siteId, selector, text));
  if (filled) {
    return;
  }

  await fillPromptViaNativeInput(tabId, siteId, selector, text);
  const filledAfterNativeInput = await isPromptFilled(
    tabId,
    siteId,
    selector,
    text,
  );
  if (!filledAfterNativeInput) {
    throw new Error(
      result.ok
        ? "Prompt input did not retain the inserted text"
        : result.reason || "Failed to fill prompt input",
    );
  }
}

async function isPromptFilled(tabId, siteId, selector, text) {
  const expected = String(text || "").trim();
  if (!expected) {
    return true;
  }
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(
        getPromptSelectorsForSite(siteId, selector),
      )};
      let element = null;
      for (const candidateSelector of selectors) {
        element = __zoteroWebAIDeepQuery(document, candidateSelector);
        if (element) break;
      }
      if (!element) return false;
      const current = "value" in element
        ? String(element.value || "")
        : element.isContentEditable
          ? String(element.textContent || "")
          : "";
      const normalizedCurrent = current.replace(/\\s+/g, " ").trim();
      const normalizedExpected = ${JSON.stringify(expected)}
        .replace(/\\s+/g, " ")
        .trim();
      if (!normalizedCurrent || !normalizedExpected) return false;
      return (
        normalizedCurrent.includes(normalizedExpected.slice(0, Math.min(32, normalizedExpected.length))) ||
        normalizedExpected.includes(normalizedCurrent.slice(0, Math.min(32, normalizedCurrent.length)))
      );
    })()`,
  );
}

async function fillPromptViaNativeInput(tabId, siteId, selector, text) {
  const selectors = getPromptSelectorsForSite(siteId, selector);
  const prepared = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(selectors)};
      let element = null;
      for (const candidateSelector of selectors) {
        element = __zoteroWebAIDeepQuery(document, candidateSelector);
        if (element) break;
      }
      if (!element) return false;
      element.scrollIntoView?.({ block: "center", inline: "center" });
      element.focus?.();
      if ("value" in element) {
        const prototype =
          element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : element instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : null;
        const setter = prototype
          ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
          : null;
        if (setter) {
          setter.call(element, "");
        } else {
          element.value = "";
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      if (element.isContentEditable) {
        element.textContent = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    })()`,
  );
  if (!prepared) {
    throw new Error(
      "Prompt input could not be prepared for native text insertion",
    );
  }

  const point = await getClickablePointBySelectors(tabId, selectors);
  if (point) {
    await clickViewportPoint(tabId, point.x, point.y);
  } else {
    await focusBySelectors(tabId, selectors);
  }
  await delay(100);
  await sendCommand(tabId, "Input.insertText", {
    text,
  });
  await delay(200);
}

function getPromptSelectorsForSite(siteId, selector) {
  const selectorParts = String(selector || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (siteId === "chatgpt") {
    return [
      "#prompt-textarea",
      '[role="textbox"]',
      '[aria-label*="ChatGPT"]',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      "textarea",
      ...selectorParts,
    ];
  }
  return selectorParts;
}

async function detectChatGPTDuplicateFileDialog(tabId) {
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const roots = __zoteroWebAICollectRoots(document);
      const keywords = [
        "你已上传过此文件",
        "尝试上传一些新内容",
        "you've already uploaded this file",
        "already uploaded this file",
        "try uploading something new"
      ].map((value) => value.toLowerCase());
      for (const root of roots) {
        const elements = root.querySelectorAll?.("div, section, article, h1, h2, h3, p, span") || [];
        for (const element of elements) {
          const text = (element.textContent || "").toLowerCase().replace(/\\s+/g, " ").trim();
          if (!text) continue;
          if (keywords.some((keyword) => text.includes(keyword))) {
            return true;
          }
        }
      }
      return false;
    })()`,
  );
}

async function dismissChatGPTDuplicateFileDialog(tabId) {
  const clickedByText = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const labels = ["确定", "ok", "okay", "confirm"];
      const candidates = __zoteroWebAIDeepQueryAll(
        document,
        "button, [role='button']",
      );
      for (const element of candidates) {
        const text = [
          element.textContent || "",
          element.getAttribute?.("aria-label") || "",
          element.getAttribute?.("title") || ""
        ]
          .join(" ")
          .toLowerCase()
          .replace(/\\s+/g, " ")
          .trim();
        if (!text) continue;
        if (!labels.some((label) => text.includes(label))) continue;
        if (!__zoteroWebAIIsVisible(element)) continue;
        element.scrollIntoView?.({ block: "center", inline: "center" });
        element.click?.();
        return true;
      }
      return false;
    })()`,
  );
  if (clickedByText) {
    await delay(250);
    const stillVisible = await detectChatGPTDuplicateFileDialog(tabId);
    if (!stillVisible) {
      return true;
    }
  }

  const point = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const labels = ["确定", "ok", "okay", "confirm"];
      const candidates = __zoteroWebAIDeepQueryAll(
        document,
        "button, [role='button']",
      );
      for (const element of candidates) {
        if (!__zoteroWebAIIsVisible(element)) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const text = [
          element.textContent || "",
          element.getAttribute?.("aria-label") || "",
          element.getAttribute?.("title") || ""
        ]
          .join(" ")
          .toLowerCase()
          .replace(/\\s+/g, " ")
          .trim();
        if (!text) continue;
        if (!labels.some((label) => text.includes(label))) continue;
        element.scrollIntoView?.({ block: "center", inline: "center" });
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      return null;
    })()`,
  );
  if (point) {
    await clickViewportPoint(tabId, point.x, point.y);
    await delay(250);
    const stillVisible = await detectChatGPTDuplicateFileDialog(tabId);
    if (!stillVisible) {
      return true;
    }
  }
  return false;
}

async function waitForChatGPTDuplicateDialogToDisappear(tabId, timeout = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const visible = await detectChatGPTDuplicateFileDialog(tabId);
    if (!visible) {
      return true;
    }
    await delay(150);
  }
  return false;
}

async function focus(tabId, selector) {
  const focused = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const el = __zoteroWebAIDeepQuery(document, ${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView?.({ block: "center", inline: "center" });
      el.focus();
      return true;
    })()`,
  );
  if (!focused) {
    throw new Error(`Failed to focus selector: ${selector}`);
  }
}

async function focusBySelectors(tabId, selectors) {
  const focused = await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(selectors)};
      for (const selector of selectors) {
        const el = __zoteroWebAIDeepQuery(document, selector);
        if (!el) continue;
        el.scrollIntoView?.({ block: "center", inline: "center" });
        el.focus?.();
        return true;
      }
      return false;
    })()`,
  );
  if (!focused) {
    throw new Error(`Failed to focus any selector: ${selectors.join(", ")}`);
  }
}

async function getClickablePoint(tabId, selector) {
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const element = __zoteroWebAIDeepQueryClickable(
        document,
        ${JSON.stringify(selector)},
      );
      if (!element) {
        return null;
      }
      element.scrollIntoView?.({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return null;
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
  );
}

async function getClickablePointBySelectors(tabId, selectors) {
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(selectors)};
      for (const selector of selectors) {
        const element = __zoteroWebAIDeepQueryClickable(document, selector);
        if (!element) continue;
        element.scrollIntoView?.({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      return null;
    })()`,
  );
}

async function clickViewportPoint(tabId, x, y) {
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function getObjectId(tabId, selector) {
  const response = await sendCommand(tabId, "Runtime.evaluate", {
    expression: `(() => {
      ${getDeepQueryHelperSource()}
      return __zoteroWebAIDeepQuery(document, ${JSON.stringify(selector)});
    })()`,
  });
  const objectId = response?.result?.objectId;
  if (!objectId) {
    throw new Error(`Selector did not resolve to an element: ${selector}`);
  }
  return objectId;
}

async function dispatchFileEvents(tabId, selector) {
  await evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const input = __zoteroWebAIDeepQuery(document, ${JSON.stringify(
        selector,
      )});
      if (!input) return false;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
}

async function evaluate(tabId, expression) {
  const response = await sendCommand(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    userGesture: true,
    awaitPromise: true,
  });
  return response?.result?.value;
}

async function uploadViaFileChooser(
  tabId,
  siteId,
  localFileMenuItemSelector,
  fileInputSelector,
  uploadButtonSelector,
  filePath,
) {
  await sendCommand(tabId, "Page.setInterceptFileChooserDialog", {
    enabled: true,
  });
  try {
    if (localFileMenuItemSelector) {
      const localOptionAlreadyVisible = await waitForSelectorMaybe(
        tabId,
        localFileMenuItemSelector,
        800,
      );
      if (localOptionAlreadyVisible) {
        const clickedVisibleLocalOption = await clickForSite(
          tabId,
          siteId,
          localFileMenuItemSelector,
        );
        if (clickedVisibleLocalOption) {
          const visibleOptionActivated = await finishFileChooserAttempt(
            tabId,
            siteId,
            localFileMenuItemSelector,
            fileInputSelector,
            filePath,
          );
          if (visibleOptionActivated) {
            return;
          }
        }
      }
    }

    await waitForSelectorMaybe(tabId, uploadButtonSelector, 4000);
    let clicked = await clickForSite(tabId, siteId, uploadButtonSelector);
    if (!clicked) {
      const clickedTrigger = await clickKnownUploadTrigger(tabId);
      if (clickedTrigger) {
        await delay(400);
        clicked = await clickForSite(tabId, siteId, uploadButtonSelector);
      }
      if (!clicked) {
        throw new Error(`Upload button was not found: ${uploadButtonSelector}`);
      }
    }
    let chooserOpened = await waitForDebuggerEventMaybe(
      tabId,
      "Page.fileChooserOpened",
      1500,
    );
    if (!chooserOpened) {
      const directInputAppeared = await waitForSelectorMaybe(
        tabId,
        fileInputSelector,
        1200,
      );
      if (directInputAppeared) {
        await uploadFile(tabId, fileInputSelector, filePath);
        return;
      }
      let clickedLocalOption = false;
      if (localFileMenuItemSelector) {
        await waitForSelectorMaybe(tabId, localFileMenuItemSelector, 1500);
        clickedLocalOption = await clickForSite(
          tabId,
          siteId,
          localFileMenuItemSelector,
        );
      }
      if (!clickedLocalOption) {
        clickedLocalOption = await clickKnownLocalFileOption(tabId);
      }
      if (!clickedLocalOption) {
        throw new Error(
          `Upload button was clicked, but no file chooser opened and no local-file menu item was found: ${uploadButtonSelector}`,
        );
      }
      const localOptionActivated = await finishFileChooserAttempt(
        tabId,
        siteId,
        localFileMenuItemSelector,
        fileInputSelector,
        filePath,
      );
      if (!localOptionActivated) {
        throw new Error(
          `Upload menu item was clicked, but neither a file chooser nor a matching file input appeared for selector: ${fileInputSelector}`,
        );
      }
      return;
    }
    await sendCommand(tabId, "Page.handleFileChooser", {
      action: "accept",
      files: [filePath],
    });
    await delay(500);
  } finally {
    await sendCommand(tabId, "Page.setInterceptFileChooserDialog", {
      enabled: false,
    }).catch((error) => {
      console.warn("Failed to disable file chooser interception", error);
    });
  }
}

async function finishFileChooserAttempt(
  tabId,
  siteId,
  localFileMenuItemSelector,
  fileInputSelector,
  filePath,
) {
  const chooserOpened = await waitForDebuggerEventMaybe(
    tabId,
    "Page.fileChooserOpened",
    2000,
  );
  if (chooserOpened) {
    await sendCommand(tabId, "Page.handleFileChooser", {
      action: "accept",
      files: [filePath],
    });
    await delay(500);
    return true;
  }

  const delayedInputAppeared = await waitForSelectorMaybe(
    tabId,
    fileInputSelector,
    2000,
  );
  if (delayedInputAppeared) {
    await uploadFile(tabId, fileInputSelector, filePath);
    return true;
  }

  const directTriggerActivated = await activateDirectFileTrigger(tabId, siteId);
  if (directTriggerActivated) {
    const chooserFromDirectTrigger = await waitForDebuggerEventMaybe(
      tabId,
      "Page.fileChooserOpened",
      2000,
    );
    if (chooserFromDirectTrigger) {
      await sendCommand(tabId, "Page.handleFileChooser", {
        action: "accept",
        files: [filePath],
      });
      await delay(500);
      return true;
    }

    const inputFromDirectTrigger = await waitForSelectorMaybe(
      tabId,
      fileInputSelector,
      2000,
    );
    if (inputFromDirectTrigger) {
      await uploadFile(tabId, fileInputSelector, filePath);
      return true;
    }
  }

  if (
    siteId !== "chatgpt" &&
    localFileMenuItemSelector &&
    (await nativeClickIfPresent(tabId, localFileMenuItemSelector))
  ) {
    const chooserFromNativeClick = await waitForDebuggerEventMaybe(
      tabId,
      "Page.fileChooserOpened",
      2000,
    );
    if (chooserFromNativeClick) {
      await sendCommand(tabId, "Page.handleFileChooser", {
        action: "accept",
        files: [filePath],
      });
      await delay(500);
      return true;
    }

    const inputFromNativeClick = await waitForSelectorMaybe(
      tabId,
      fileInputSelector,
      2000,
    );
    if (inputFromNativeClick) {
      await uploadFile(tabId, fileInputSelector, filePath);
      return true;
    }
  }

  return false;
}

async function activateDirectFileTrigger(tabId, siteId) {
  const selectors = getDirectFileTriggerSelectors(siteId);
  if (!selectors.length) {
    return false;
  }

  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const selectors = ${JSON.stringify(selectors)};
      for (const selector of selectors) {
        const candidates = __zoteroWebAIDeepQueryAll(document, selector);
        for (const element of candidates) {
          if (!element) continue;
          if (element instanceof HTMLInputElement && element.type === "file") {
            if (typeof element.showPicker === "function") {
              element.showPicker();
              return selector;
            }
            element.click();
            return selector;
          }
          const isProbablyHidden =
            element.getAttribute?.("aria-hidden") === "true" ||
            element.hidden === true;
          const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
          const displayNone = style?.display === "none";
          if (isProbablyHidden || displayNone || __zoteroWebAIIsVisible(element)) {
            element.click?.();
            return selector;
          }
        }
      }
      return "";
    })()`,
  );
}

function getDirectFileTriggerSelectors(siteId) {
  switch (siteId) {
    case "gemini":
      return [
        'button[data-test-id="hidden-local-file-upload-button"]',
        'button[xapifileselectortrigger][data-test-id="hidden-local-file-upload-button"]',
        'button[data-test-id="hidden-local-image-upload-button"]',
        "button[xapifileselectortrigger]",
        'input[type="file"]',
      ];
    case "notebooklm":
      return [
        "button[xapifileselectortrigger]",
        "button[xapscottyuploadertrigger]",
        'button[data-test-id="hidden-local-file-upload-button"]',
        'input[type="file"]',
      ];
    default:
      return [];
  }
}

async function releaseObject(tabId, objectId) {
  try {
    await sendCommand(tabId, "Runtime.releaseObject", {
      objectId,
    });
  } catch (error) {
    console.warn("Failed to release runtime object", error);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForDebuggerEvent(tabId, method, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(onEvent);
      reject(new Error(`Timed out waiting for debugger event: ${method}`));
    }, timeout);

    const onEvent = (source, eventMethod, params) => {
      if (source.tabId !== tabId || eventMethod !== method) {
        return;
      }
      clearTimeout(timer);
      chrome.debugger.onEvent.removeListener(onEvent);
      resolve(params);
    };

    chrome.debugger.onEvent.addListener(onEvent);
  });
}

async function waitForDebuggerEventMaybe(tabId, method, timeout = 1500) {
  try {
    return await waitForDebuggerEvent(tabId, method, timeout);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `Timed out waiting for debugger event: ${method}`
    ) {
      return null;
    }
    throw error;
  }
}

async function waitForSelectorMaybe(tabId, selector, timeout = 1500) {
  try {
    await waitForSelector(tabId, selector, timeout);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `Timed out waiting for selector: ${selector}`
    ) {
      return false;
    }
    throw error;
  }
}

async function clickKnownLocalFileOption(tabId) {
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const keywords = [
        "files",
        "file",
        "upload files",
        "upload file",
        "from computer",
        "from device",
        "local file",
        "device",
        "pdf",
        "文件",
        "上传文件",
        "本地文件",
        "从计算机",
        "从设备",
        "上传来源",
        "来源"
      ];
      const roots = __zoteroWebAICollectRoots(document);
      const selectors = [
        "button",
        "[role='button']",
        "[role='menuitem']",
        "label",
        "li",
        "[tabindex]"
      ];
      const seen = new Set();
      for (const root of roots) {
        for (const selector of selectors) {
          const elements = root.querySelectorAll?.(selector) || [];
          for (const element of elements) {
            if (seen.has(element)) continue;
            seen.add(element);
            const haystack = [
              element.getAttribute?.("aria-label") || "",
              element.getAttribute?.("title") || "",
              element.textContent || ""
            ]
              .join(" ")
              .toLowerCase()
              .replace(/\\s+/g, " ")
              .trim();
            if (!haystack) continue;
            if (!keywords.some((keyword) => haystack.includes(keyword))) continue;
            element.scrollIntoView?.({ block: "center", inline: "center" });
            element.click?.();
            return haystack;
          }
        }
      }
      return "";
    })()`,
  );
}

async function clickKnownUploadTrigger(tabId) {
  return evaluate(
    tabId,
    `(() => {
      ${getDeepQueryHelperSource()}
      const triggerSelectors = [
        "button",
        "[role='button']",
        "[tabindex]",
        "label"
      ];
      const positiveKeywords = [
        "attach",
        "attachment",
        "upload",
        "upload menu",
        "open file upload menu",
        "add",
        "plus",
        "source",
        "paperclip",
        "文件",
        "上传",
        "打开文件上传菜单",
        "附件",
        "添加",
        "来源",
        "添加文件",
        "添加来源"
      ];
      const negativeKeywords = [
        "send",
        "mic",
        "voice",
        "search",
        "deep research",
        "语音",
        "发送",
        "搜索"
      ];
      const roots = __zoteroWebAICollectRoots(document);
      const candidates = [];
      const seen = new Set();
      for (const root of roots) {
        for (const selector of triggerSelectors) {
          const elements = root.querySelectorAll?.(selector) || [];
          for (const element of elements) {
            if (seen.has(element)) continue;
            seen.add(element);
            const texts = [
              element.getAttribute?.("aria-label") || "",
              element.getAttribute?.("title") || "",
              element.getAttribute?.("data-test-id") || "",
              element.getAttribute?.("data-testid") || "",
              element.textContent || ""
            ];
            const iconTexts = Array.from(element.querySelectorAll?.("mat-icon, span, div") || [])
              .slice(0, 4)
              .map((node) => node.textContent || "");
            const haystack = texts
              .concat(iconTexts)
              .join(" ")
              .toLowerCase()
              .replace(/\\s+/g, " ")
              .trim();
            if (!haystack) continue;
            if (negativeKeywords.some((keyword) => haystack.includes(keyword))) {
              continue;
            }
            if (!positiveKeywords.some((keyword) => haystack.includes(keyword))) {
              continue;
            }
            candidates.push({ element, haystack });
          }
        }
      }
      const preferred = candidates.sort((a, b) => {
        const aScore =
          (a.haystack.includes("upload") ? 4 : 0) +
          (a.haystack.includes("attach") ? 4 : 0) +
          (a.haystack.includes("source") ? 3 : 0) +
          (a.haystack.includes("文件") ? 3 : 0) +
          (a.haystack.includes("上传") ? 3 : 0) +
          (a.haystack.includes("添加") ? 2 : 0);
        const bScore =
          (b.haystack.includes("upload") ? 4 : 0) +
          (b.haystack.includes("attach") ? 4 : 0) +
          (b.haystack.includes("source") ? 3 : 0) +
          (b.haystack.includes("文件") ? 3 : 0) +
          (b.haystack.includes("上传") ? 3 : 0) +
          (b.haystack.includes("添加") ? 2 : 0);
        return bScore - aScore;
      })[0];
      if (!preferred) return "";
      preferred.element.scrollIntoView?.({ block: "center", inline: "center" });
      preferred.element.click?.();
      return preferred.haystack;
    })()`,
  );
}

function buildDeepQueryBooleanExpression(selector) {
  return `(() => {
    ${getDeepQueryHelperSource()}
    return Boolean(__zoteroWebAIDeepQuery(document, ${JSON.stringify(selector)}));
  })()`;
}

function getDeepQueryHelperSource() {
  return `
    function __zoteroWebAIIsVisible(element) {
      if (!element) return false;
      const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
      if (!style) return false;
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none"
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect?.();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    }
    function __zoteroWebAICollectRoots(root, roots = []) {
      if (!root || roots.includes(root)) return roots;
      roots.push(root);
      const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const element of elements) {
        if (element.shadowRoot) {
          __zoteroWebAICollectRoots(element.shadowRoot, roots);
        }
      }
      return roots;
    }
    function __zoteroWebAIDeepQuery(root, selector) {
      const roots = __zoteroWebAICollectRoots(root);
      for (const currentRoot of roots) {
        const found = currentRoot.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    }
    function __zoteroWebAIDeepQueryAll(root, selector) {
      const roots = __zoteroWebAICollectRoots(root);
      const results = [];
      for (const currentRoot of roots) {
        const found = currentRoot.querySelectorAll?.(selector) || [];
        for (const element of found) {
          results.push(element);
        }
      }
      return results;
    }
    function __zoteroWebAIDeepQueryClickable(root, selector) {
      const roots = __zoteroWebAICollectRoots(root);
      for (const currentRoot of roots) {
        const elements = currentRoot.querySelectorAll?.(selector) || [];
        for (const element of elements) {
          if (__zoteroWebAIIsVisible(element)) {
            return element;
          }
        }
      }
      return null;
    }
  `;
}
