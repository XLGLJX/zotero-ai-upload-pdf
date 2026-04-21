import { assert } from "chai";
import { normalizeSiteProfiles } from "../src/services/profiles";

describe("site profiles", function () {
  it("normalizes whitespace and lowercase IDs", function () {
    const profiles = normalizeSiteProfiles([
      {
        id: " ChatGPT ",
        name: " ChatGPT ",
        url: " https://chatgpt.com/ ",
        ready: " main ",
        optionalNewChatButton: " button ",
        optionalLocalFileMenuItem: " ",
        fileInput: ' input[type="file"] ',
        promptInput: " textarea ",
        sendButton: " button ",
        optionalUploadButton: " ",
        enabled: true,
      },
    ]);

    assert.equal(profiles[0].id, "chatgpt");
    assert.equal(profiles[0].name, "ChatGPT");
    assert.equal(profiles[0].url, "https://chatgpt.com/");
  });

  it("rejects duplicate IDs", function () {
    assert.throws(() =>
      normalizeSiteProfiles([
        {
          id: "dup",
          name: "One",
          url: "https://example.com/1",
          ready: "main",
          optionalNewChatButton: "",
          optionalLocalFileMenuItem: "",
          fileInput: 'input[type="file"]',
          promptInput: "textarea",
          sendButton: "button",
          optionalUploadButton: "",
          enabled: true,
        },
        {
          id: "dup",
          name: "Two",
          url: "https://example.com/2",
          ready: "main",
          optionalNewChatButton: "",
          optionalLocalFileMenuItem: "",
          fileInput: 'input[type="file"]',
          promptInput: "textarea",
          sendButton: "button",
          optionalUploadButton: "",
          enabled: true,
        },
      ]),
    );
  });
});
