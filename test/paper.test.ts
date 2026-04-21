import { assert } from "chai";
import { pickLocalPdfCandidate } from "../src/services/paper";

describe("paper resolution helpers", function () {
  it("picks the first local PDF candidate", function () {
    const result = pickLocalPdfCandidate([
      { id: 1, contentType: "text/plain", path: "/tmp/file.txt" },
      { id: 2, contentType: "application/pdf", path: null },
      { id: 3, contentType: "application/pdf", path: "/tmp/paper.pdf" },
      { id: 4, contentType: "application/pdf", path: "/tmp/second.pdf" },
    ]);

    assert.isNotNull(result);
    assert.equal(result?.id, 3);
  });

  it("returns null when no local PDF exists", function () {
    const result = pickLocalPdfCandidate([
      { id: 1, contentType: "application/pdf", path: null },
      { id: 2, contentType: "text/plain", path: "/tmp/file.txt" },
    ]);

    assert.isNull(result);
  });
});
