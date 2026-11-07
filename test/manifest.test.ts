import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("opens the whole site as a standalone app", () => {
    const m = manifest();
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("points only at icons the app actually serves", () => {
    // src/app/icon.svg and src/app/apple-icon.png, Next's metadata files.
    expect(manifest().icons?.map((i) => i.src)).toEqual([
      "/icon.svg",
      "/apple-icon.png",
    ]);
  });
});
