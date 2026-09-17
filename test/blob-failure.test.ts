import { BlobError } from "@vercel/blob";
import { afterEach, describe, expect, it, vi } from "vitest";

import { blobFailure } from "@/lib/blob-failure";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A real token's shape: vercel_blob_rw_<storeId>_<secret>. */
const TOKEN = "vercel_blob_rw_StoReAbC123_thesecretpart";

describe("what an operator is told when the blob store refuses", () => {
  it("passes anything that is not a blob failure straight through", () => {
    expect(blobFailure(new Error("timed out"), "file")).toBeNull();
  });

  /*
   * The whole point. Vercel answers "Access denied, please provide a valid
   * token for this resource", which reads as a problem with the store and
   * sends you to the store's settings - when the mistake is nearly always the
   * variable. Printing the id out of the token is what lets the two be
   * compared.
   */
  it("names the store the token points at, not the one you think is connected", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    blobFailure(new BlobError("Access denied"), "photo");

    expect(log).toHaveBeenCalledWith(expect.stringContaining("StoReAbC123"));
  });

  /*
   * "unknown" is an answer rather than a shrug: the value is not shaped like a
   * token, which is what a paste that brought its quotes along looks like.
   */
  it("says unknown when the value is not shaped like a token", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", `"${TOKEN}`.slice(0, 12));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    blobFailure(new BlobError("Access denied"), "file");

    expect(log).toHaveBeenCalledWith(expect.stringContaining("unknown"));
  });

  it("never prints the secret half of the token", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    blobFailure(new BlobError("Access denied"), "file");

    const printed = log.mock.calls.flat().join(" ");
    expect(printed).not.toContain("thesecretpart");
  });

  it("tells the person it was not their file, and says nothing was saved", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = blobFailure(new BlobError("Access denied"), "photo");
    expect(response?.status).toBe(500);

    const body = await response!.json();
    expect(body.error).toMatch(/not a problem with your photo/);
    expect(body.error).toMatch(/nothing was saved/i);
  });
});
