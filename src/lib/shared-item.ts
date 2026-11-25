/**
 * Something shared to Trivet from the iPhone share sheet, handed to the upload
 * page by the app rather than in the page's address.
 *
 * A link fits in `/upload?url=…`. Screenshots, photos and PDFs do not, and
 * neither do the words read off them, so for those the app loads
 * `/upload?shared=1` and the page asks for the item over a script message
 * handler the app installs, `trivetShare` (ios/TrivetBox/TrivetBox/
 * ShareBridge.swift). Three messages, each answered:
 *
 * - `{type: "ready"}` → a summary of what is waiting, or null.
 * - `{type: "file", index}` → that file's bytes, base64.
 * - `{type: "taken"}` → the app forgets the item. Sent once everything has
 *   arrived, so a page that fails part-way leaves it waiting for next time.
 *
 * Outside the app there is no handler, and `?shared=1` does nothing.
 */

/** Must match `ShareBridge.name` in the app. */
export const SHARE_BRIDGE = "trivetShare";

/**
 * Must match `ScanBridge.name` in the app. The upload page's "Scan a card"
 * button: the same three messages as the share bridge, except that the first
 * is `scan`, which opens the iPhone's document scanner and is answered when it
 * closes (ios/TrivetBox/TrivetBox/ScanBridge.swift). Only installed where the
 * scanner works, so its presence is what shows the button.
 */
export const SCAN_BRIDGE = "trivetScan";

/** The most files one share carries. The photo import's own limit. */
export const MAX_SHARED_FILES = 6;

export type SharedFileInfo = { name: string; type: string; size: number };

export type SharedSummary =
  | {
      kind: "text";
      text: string;
      /** How many screenshots it was read from; null for text shared as text. */
      screenshots: number | null;
      /** How many pages were scanned, for a scan. Absent otherwise. */
      pages?: number;
    }
  | { kind: "files"; files: SharedFileInfo[]; pages?: number };

/** `{pages}` for a scan, nothing for a share. */
function scanned(value: Record<string, unknown>): { pages?: number } {
  const pages = count(value.pages);
  return pages ? { pages } : {};
}

/** A positive whole number, or null. */
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

const FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
]);

/**
 * The app's summary, checked. Anything malformed is treated as nothing
 * waiting: the page then simply shows its three ways in.
 */
export function readSharedSummary(raw: unknown): SharedSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (value.kind === "text") {
    if (typeof value.text !== "string" || !value.text.trim()) return null;
    return {
      kind: "text",
      text: value.text,
      screenshots: count(value.screenshots),
      ...scanned(value),
    };
  }

  if (value.kind === "files" && Array.isArray(value.files)) {
    const files: SharedFileInfo[] = [];
    for (const entry of value.files) {
      if (!entry || typeof entry !== "object") return null;
      const { name, type, size } = entry as Record<string, unknown>;
      if (
        typeof name !== "string" ||
        typeof type !== "string" ||
        !FILE_TYPES.has(type) ||
        typeof size !== "number" ||
        size <= 0
      ) {
        return null;
      }
      files.push({ name, type, size });
    }
    if (files.length === 0 || files.length > MAX_SHARED_FILES) return null;
    // One PDF on its own, or photos: the upload route reads one or the other.
    const pdfs = files.filter((file) => file.type === "application/pdf");
    if (pdfs.length > 0 && files.length > 1) return null;
    return { kind: "files", files, ...scanned(value) };
  }

  return null;
}

/** The band's overline: `Shared to Trivet · 2 screenshots`. */
export function sharedLabel(summary: SharedSummary): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (summary.pages) return `Scanned · ${plural(summary.pages, "page")}`;
  if (summary.kind === "text") {
    return summary.screenshots
      ? `Shared to Trivet · ${plural(summary.screenshots, "screenshot")}`
      : "Shared to Trivet · Some text";
  }
  if (summary.files[0].type === "application/pdf") {
    return "Shared to Trivet · 1 PDF";
  }
  return `Shared to Trivet · ${plural(summary.files.length, "photo")}`;
}

/** The band's sentence, while it is being read. */
export function sharedSentence(summary: SharedSummary): string {
  if (summary.kind === "text") {
    return summary.screenshots || summary.pages
      ? "Read on your phone. Trivet is turning the words into a recipe."
      : "Trivet is turning it into a recipe.";
  }
  if (summary.files[0].type === "application/pdf") {
    return "Trivet is reading it now.";
  }
  if (summary.pages) {
    return summary.files.length === 1
      ? "Trivet is reading the scan."
      : "Trivet is reading the pages as one recipe.";
  }
  return summary.files.length === 1
    ? "Trivet is reading the photo."
    : "Trivet is reading them as one recipe.";
}

/** A file from the base64 the app sends. */
export function fileFromBase64(base64: string, info: SharedFileInfo): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], info.name, { type: info.type });
}

type Bridge = { postMessage(message: unknown): Promise<unknown> };

/** One of the app's handlers by name, or null outside the app. */
function appBridge(name: string): Bridge | null {
  if (typeof window === "undefined") return null;
  const handlers = (
    window as unknown as {
      webkit?: { messageHandlers?: Record<string, Partial<Bridge>> };
    }
  ).webkit?.messageHandlers;
  const handler = handlers?.[name];
  return handler && typeof handler.postMessage === "function"
    ? (handler as Bridge)
    : null;
}

/** The share sheet's handler, or null outside the app. */
export function shareBridge(): Bridge | null {
  return appBridge(SHARE_BRIDGE);
}

/** The document scanner's handler, or null where there is none. */
export function scanBridge(): Bridge | null {
  return appBridge(SCAN_BRIDGE);
}

/**
 * Take the waiting item from the app: the summary, then each file in turn.
 * Null when there is nothing waiting or no app to ask. Throws if a file does
 * not arrive, so the item stays waiting rather than half-delivered.
 */
export async function takeSharedItem(
  bridge: Bridge,
  /** `scan` for the scanner, which opens it and answers when it closes. */
  first: "ready" | "scan" = "ready",
): Promise<
  | { kind: "text"; summary: SharedSummary & { kind: "text" } }
  | { kind: "files"; summary: SharedSummary & { kind: "files" }; files: File[] }
  | null
> {
  const summary = readSharedSummary(await bridge.postMessage({ type: first }));
  if (!summary) return null;
  if (summary.kind === "text") return { kind: "text", summary };

  const files: File[] = [];
  for (const [index, info] of summary.files.entries()) {
    const data = await bridge.postMessage({ type: "file", index });
    if (typeof data !== "string" || !data) {
      throw new Error(`Shared file ${index} did not arrive`);
    }
    files.push(fileFromBase64(data, info));
  }
  return { kind: "files", summary, files };
}
