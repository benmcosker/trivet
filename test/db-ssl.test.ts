import { describe, expect, it } from "vitest";

import { withVerifiedSsl } from "@/lib/db";

describe("withVerifiedSsl", () => {
  it("spells require as verify-full, which is what the driver does anyway", () => {
    expect(
      withVerifiedSsl(
        "postgresql://u:p@host/db?channel_binding=require&sslmode=require",
      ),
    ).toBe(
      "postgresql://u:p@host/db?channel_binding=require&sslmode=verify-full",
    );
    expect(withVerifiedSsl("postgresql://h/db?sslmode=require&x=1")).toBe(
      "postgresql://h/db?sslmode=verify-full&x=1",
    );
  });

  it("leaves every other address alone", () => {
    for (const url of [
      "postgresql://localhost/trivet",
      "postgresql://h/db?sslmode=disable",
      "postgresql://h/db?sslmode=prefer",
      "postgresql://h/db?sslmode=verify-full",
    ]) {
      expect(withVerifiedSsl(url)).toBe(url);
    }
  });
});
