import { assert } from "chai";
import { renderPromptTemplate } from "../src/services/prompt";

describe("prompt template", function () {
  it("renders all supported placeholders", function () {
    const result = renderPromptTemplate(
      "{{title}}|{{authors}}|{{year}}|{{abstract}}|{{journal}}|{{fileName}}",
      {
        title: "Paper Title",
        authors: "Alice, Bob",
        year: "2025",
        abstractNote: "Summary",
        journal: "Nature",
        fileName: "paper.pdf",
      },
    );

    assert.equal(
      result,
      "Paper Title|Alice, Bob|2025|Summary|Nature|paper.pdf",
    );
  });
});
