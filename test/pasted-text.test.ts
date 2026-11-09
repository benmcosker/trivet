import { describe, expect, it } from "vitest";

import {
  MAX_PASTED_CHARS,
  MIN_PASTED_CHARS,
  readPastedText,
} from "@/lib/pasted-text";

const caption =
  "Crispy lemon chicken 🍋\n2 chicken breasts, 1 lemon, 1/2 cup flour.\n" +
  "Pound, dredge, fry 3 min a side. Squeeze lemon over. #dinner";

describe("readPastedText", () => {
  it("takes a caption and trims it", () => {
    expect(readPastedText(`  ${caption}  `)).toEqual({
      ok: true,
      text: caption,
      link: null,
    });
  });

  it("refuses nothing, a sentence, and a whole page", () => {
    expect(readPastedText("   ")).toEqual({ ok: false, reason: "empty" });
    expect(readPastedText(null)).toEqual({ ok: false, reason: "empty" });
    expect(readPastedText("x".repeat(MIN_PASTED_CHARS - 1))).toEqual({
      ok: false,
      reason: "short",
    });
    expect(readPastedText("x".repeat(MAX_PASTED_CHARS + 1))).toEqual({
      ok: false,
      reason: "long",
    });
  });

  it("keeps the first link as the source, without its trailing punctuation", () => {
    const shared = `${caption}\nFrom https://www.tiktok.com/@cook/video/123. Also https://example.com/b`;
    const read = readPastedText(shared);
    expect(read.ok && read.link).toBe("https://www.tiktok.com/@cook/video/123");
  });

  it("ignores something that only looks like a link", () => {
    const read = readPastedText(`${caption}\nhttps://localhost`);
    expect(read.ok && read.link).toBeNull();
  });
});
