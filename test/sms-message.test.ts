import { describe, expect, it } from "vitest";

import { APP_NAME, BRAND } from "@/lib/legal";

import {
  MAX_MESSAGE_CHARS,
  shoppingListMessage,
  splitMessage,
  toPlainText,
} from "@/lib/sms/message";

describe("toPlainText", () => {
  it("replaces the characters a recipe PDF leaves behind", () => {
    // These are what force a message into UCS-2, cutting a segment from 153
    // characters to 67 - so one en-dash in an ingredient name more than
    // doubles what the list costs to send.
    expect(toPlainText("½ cup crème – “fresh”")).toBe(
      '1/2 cup crème - "fresh"',
    );
  });

  it("leaves alone anything with no plain equivalent", () => {
    // Mangling a name is worse than paying for a longer message.
    expect(toPlainText("Gochujang 고추장")).toBe("Gochujang 고추장");
  });

  it("turns a non-breaking space into an ordinary one", () => {
    expect(toPlainText("2 tbsp")).toBe("2 tbsp");
  });
});

describe("splitMessage", () => {
  const list = (sections: number, itemsEach: number) =>
    Array.from({ length: sections }, (_, s) =>
      [
        `Section ${s}:`,
        ...Array.from({ length: itemsEach }, (_, i) => `item ${s}-${i}`),
      ].join("\n"),
    ).join("\n\n");

  it("leaves a short list as one unnumbered message", () => {
    // "(1/1)" on a single message reads like something went wrong.
    expect(splitMessage("Produce:\n2 lemons")).toEqual(["Produce:\n2 lemons"]);
  });

  it("returns nothing for an empty list rather than an empty message", () => {
    expect(splitMessage("   ")).toEqual([]);
  });

  it("numbers the parts when it has to split", () => {
    const parts = splitMessage(list(20, 12));
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part, index) => {
      expect(part.endsWith(` (${index + 1}/${parts.length})`)).toBe(true);
    });
  });

  it("keeps every part within the limit, suffix included", () => {
    for (const part of splitMessage(list(20, 12))) {
      expect(part.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
  });

  it("breaks between aisles rather than through one", () => {
    const parts = splitMessage(list(12, 20));
    // A part that starts mid-aisle would open with an item and no heading.
    for (const part of parts.slice(1)) {
      expect(part.startsWith("Section")).toBe(true);
    }
  });

  it("loses nothing it was given", () => {
    const source = list(20, 12);
    const rejoined = splitMessage(source)
      .map((part) => part.replace(/ \(\d+\/\d+\)$/, ""))
      .join("\n\n");
    for (const line of source.split("\n")) {
      expect(rejoined).toContain(line.trim());
    }
  });

  it("splits a single line too long to fit rather than dropping it", () => {
    // Not a real ingredient, but a list that cannot be broken cleanly still
    // has to arrive.
    const monster = "x".repeat(MAX_MESSAGE_CHARS * 2);
    const parts = splitMessage(monster);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
    expect(parts.join("").replace(/ \(\d+\/\d+\)/g, "")).toContain(
      "x".repeat(1000),
    );
  });

  it("terminates on a line exactly at the budget", () => {
    // The loop slices while a line is over budget; an off-by-one here is an
    // infinite loop rather than a wrong answer.
    const parts = splitMessage("y".repeat(MAX_MESSAGE_CHARS + 1));
    expect(parts.length).toBe(2);
  });
});

describe("shoppingListMessage", () => {
  it("says who it is from, which week, and how to stop", () => {
    // The week because the message arrives days after it was asked for,
    // sometimes beside last week's, and an unlabelled list is
    // indistinguishable from the wrong one. The name because an unfamiliar
    // number sending a bare list of groceries reads as spam to the recipient
    // and to the carrier alike.
    expect(shoppingListMessage("week of 24 Aug", "Produce:\n2 lemons")).toBe(
      "McMullen Meal Magic - shopping for week of 24 Aug\n\n" +
        "Produce:\n2 lemons\n\nReply STOP to unsubscribe.",
    );
  });

  /*
   * The tripwire for the split between APP_NAME and BRAND.
   *
   * The site chrome says "Trivet" and the message bodies say the registered
   * campaign name, and the obvious tidy-up - making them agree - is the one
   * change that must not happen here without a re-registration first. A
   * carrier does not bounce a mismatched sender name, it drops the message,
   * so nothing else in this codebase would notice.
   */
  it("carries the registered campaign name, not the app's display name", () => {
    const message = shoppingListMessage("week of 24 Aug", "Produce:\n2 lemons");
    expect(message).toContain(BRAND);
    expect(message).not.toContain(APP_NAME);
  });

  it("carries no character that would force the message into UCS-2", () => {
    // A dash in the heading would double the cost of every list sent.
    const message = shoppingListMessage("week of 24 Aug", "Produce:\n2 lemons");
    expect(toPlainText(message)).toBe(message);
  });
});
