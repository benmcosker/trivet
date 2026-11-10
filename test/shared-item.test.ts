import { describe, expect, it, vi } from "vitest";

import {
  fileFromBase64,
  readSharedSummary,
  sharedLabel,
  sharedSentence,
  takeSharedItem,
} from "@/lib/shared-item";

/**
 * What the app hands the upload page from the share sheet. The app is a
 * separate program, so its answers are checked rather than trusted, and a
 * malformed one is nothing waiting rather than a broken page.
 */
describe("readSharedSummary", () => {
  it("reads words from screenshots", () => {
    expect(
      readSharedSummary({ kind: "text", text: "Noodles…", screenshots: 2 }),
    ).toEqual({ kind: "text", text: "Noodles…", screenshots: 2 });
  });

  it("reads shared text with no screenshot count as text", () => {
    expect(readSharedSummary({ kind: "text", text: "Soup" })).toEqual({
      kind: "text",
      text: "Soup",
      screenshots: null,
    });
  });

  it("reads photos and a PDF", () => {
    const photo = { name: "card.jpg", type: "image/jpeg", size: 1200 };
    expect(readSharedSummary({ kind: "files", files: [photo, photo] })).toEqual(
      { kind: "files", files: [photo, photo] },
    );
    const pdf = { name: "cake.pdf", type: "application/pdf", size: 9000 };
    expect(readSharedSummary({ kind: "files", files: [pdf] })).toEqual({
      kind: "files",
      files: [pdf],
    });
  });

  it("treats anything malformed as nothing waiting", () => {
    const photo = { name: "card.jpg", type: "image/jpeg", size: 1200 };
    const pdf = { name: "cake.pdf", type: "application/pdf", size: 9000 };
    for (const raw of [
      null,
      "text",
      { kind: "text", text: "   " },
      { kind: "files", files: [] },
      { kind: "files", files: Array(7).fill(photo) },
      { kind: "files", files: [pdf, photo] },
      { kind: "files", files: [{ ...photo, type: "text/html" }] },
      { kind: "files", files: [{ ...photo, size: 0 }] },
      { kind: "link", link: "https://example.com" },
    ]) {
      expect(readSharedSummary(raw)).toBeNull();
    }
  });
});

describe("the band", () => {
  it("says what arrived", () => {
    expect(sharedLabel({ kind: "text", text: "x", screenshots: 2 })).toBe(
      "Shared to Trivet · 2 screenshots",
    );
    expect(sharedLabel({ kind: "text", text: "x", screenshots: 1 })).toBe(
      "Shared to Trivet · 1 screenshot",
    );
    expect(sharedLabel({ kind: "text", text: "x", screenshots: null })).toBe(
      "Shared to Trivet · Some text",
    );
    expect(
      sharedLabel({
        kind: "files",
        files: [{ name: "a.pdf", type: "application/pdf", size: 1 }],
      }),
    ).toBe("Shared to Trivet · 1 PDF");
    const photo = { name: "a.jpg", type: "image/jpeg", size: 1 };
    expect(sharedLabel({ kind: "files", files: [photo, photo, photo] })).toBe(
      "Shared to Trivet · 3 photos",
    );
    expect(sharedSentence({ kind: "files", files: [photo, photo] })).toBe(
      "Trivet is reading them as one recipe.",
    );
  });
});

describe("takeSharedItem", () => {
  const info = { name: "card.jpg", type: "image/jpeg", size: 3 };

  it("asks for the summary, then each file in turn", async () => {
    const postMessage = vi.fn(async (message: { type: string }) =>
      message.type === "ready"
        ? { kind: "files", files: [info, info] }
        : btoa("abc"),
    );
    const item = await takeSharedItem({ postMessage });
    expect(postMessage.mock.calls.map(([m]) => m)).toEqual([
      { type: "ready" },
      { type: "file", index: 0 },
      { type: "file", index: 1 },
    ]);
    expect(item?.kind).toBe("files");
    if (item?.kind !== "files") return;
    expect(item.files).toHaveLength(2);
    expect(item.files[0].name).toBe("card.jpg");
    expect(item.files[0].type).toBe("image/jpeg");
    expect(new Uint8Array(await item.files[0].arrayBuffer())).toEqual(
      new Uint8Array([97, 98, 99]),
    );
  });

  it("is null when nothing is waiting", async () => {
    expect(await takeSharedItem({ postMessage: async () => null })).toBeNull();
  });

  it("throws when a file does not arrive, so the app keeps the item", async () => {
    const postMessage = async (message: { type: string }) =>
      message.type === "ready" ? { kind: "files", files: [info] } : null;
    await expect(takeSharedItem({ postMessage })).rejects.toThrow();
  });
});

describe("fileFromBase64", () => {
  it("keeps the name and type", () => {
    const file = fileFromBase64(btoa("%PDF"), {
      name: "cake.pdf",
      type: "application/pdf",
      size: 4,
    });
    expect(file.name).toBe("cake.pdf");
    expect(file.size).toBe(4);
  });
});
