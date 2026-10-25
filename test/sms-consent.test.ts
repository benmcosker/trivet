import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { SmsConsentSource } from "@/generated/prisma/enums";
import { getHousehold, saveOwnPhone } from "@/lib/household";
import {
  SMS_CONSENT_LABEL,
  SMS_FREQUENCY,
  SMS_NO_SHARING,
  SMS_PROVIDER,
} from "@/lib/legal";
import { shoppingListAudience } from "@/lib/sms/shopping-list";

import { makeHousehold, makeUser, resetDatabase } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Consent is a separate fact from having a number, and these tests are about
 * keeping it that way. The rule underneath all of them: the app may only text
 * somebody who said it could, and it has to be able to show when they said so.
 */
describe.skipIf(!hasDb)("agreeing to be texted", () => {
  let householdId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    ({ householdId, userId } = await makeHousehold("Ours"));
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const consentOf = (id: string) =>
    prisma.user.findUniqueOrThrow({
      where: { id },
      select: { phone: true, smsConsentAt: true, smsConsentSource: true },
    });

  describe("saveOwnPhone", () => {
    it("records when somebody ticked the box, and that they ticked it", async () => {
      const result = await saveOwnPhone(userId, "(508) 555-1212", true);

      expect(result).toEqual({
        ok: true,
        phone: "+15085551212",
        consented: true,
      });
      const stored = await consentOf(userId);
      expect(stored.smsConsentAt).toBeInstanceOf(Date);
      expect(stored.smsConsentSource).toBe(SmsConsentSource.CHECKBOX);
    });

    it("keeps a number given without the box, and does not pretend it is consent", async () => {
      // Somebody who fills the field in and leaves the box alone has given an
      // address, not a permission. Storing the number is fine; texting it is
      // not.
      const result = await saveOwnPhone(userId, "(508) 555-1212", false);

      expect(result).toEqual({
        ok: true,
        phone: "+15085551212",
        consented: false,
      });
      const stored = await consentOf(userId);
      expect(stored.phone).toBe("+15085551212");
      expect(stored.smsConsentAt).toBeNull();
      expect(stored.smsConsentSource).toBeNull();
    });

    it("lets somebody stop the texts without losing their number", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", true);
      await saveOwnPhone(userId, "(508) 555-1212", false);

      const stored = await consentOf(userId);
      expect(stored.phone).toBe("+15085551212");
      expect(stored.smsConsentAt).toBeNull();
    });

    it("refuses to clear the number, and says how to stop instead", async () => {
      // A number is required, so blanking the field is refused - but the
      // person doing it is almost always trying to stop the texts, and the
      // refusal has to tell them the box does that, or they will think they
      // cannot. Nothing about their consent changes on a refused save.
      await saveOwnPhone(userId, "(508) 555-1212", true);
      const result = await saveOwnPhone(userId, "", true);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/untick/i);
      const stored = await consentOf(userId);
      expect(stored.phone).toBe("+15085551212");
      expect(stored.smsConsentAt).not.toBeNull();
    });

    it("stops the texts by unticking, keeping the number", async () => {
      // The one way left to withdraw consent from the household page, so it
      // has to work without touching the number.
      await saveOwnPhone(userId, "(508) 555-1212", true);
      const result = await saveOwnPhone(userId, "(508) 555-1212", false);

      expect(result).toEqual({
        ok: true,
        phone: "+15085551212",
        consented: false,
      });
      const stored = await consentOf(userId);
      expect(stored.phone).toBe("+15085551212");
      expect(stored.smsConsentAt).toBeNull();
      expect(stored.smsConsentSource).toBeNull();
    });

    it("keeps the date of the first agreement, not the last save", async () => {
      // The fact worth being able to produce is when this person agreed, and
      // pressing Save again to fix a typo is not a new agreement.
      await saveOwnPhone(userId, "(508) 555-1212", true);
      const first = (await consentOf(userId)).smsConsentAt;

      await saveOwnPhone(userId, "(508) 555-9999", true);
      const second = (await consentOf(userId)).smsConsentAt;

      expect(second).toEqual(first);
    });

    it("dates a fresh agreement after somebody had withdrawn one", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", true);
      await saveOwnPhone(userId, "(508) 555-1212", false);
      await saveOwnPhone(userId, "(508) 555-1212", true);

      const stored = await consentOf(userId);
      expect(stored.smsConsentAt).toBeInstanceOf(Date);
      expect(stored.smsConsentSource).toBe(SmsConsentSource.CHECKBOX);
    });

    it("refuses a number it cannot parse without touching consent", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", true);
      const result = await saveOwnPhone(userId, "555-EAT-FOOD", true);

      expect(result.ok).toBe(false);
      expect((await consentOf(userId)).phone).toBe("+15085551212");
    });
  });

  describe("who may be texted", () => {
    it("leaves out a number nobody agreed to", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", false);

      const audience = await shoppingListAudience(householdId);
      expect(audience.recipients).toEqual([]);
    });

    it("says which of the two things is missing", async () => {
      // The distinction is the point: one person has to add a number, the
      // other has to tick a box, and telling them the wrong one sends them to
      // do something that will not help.
      const quiet = await makeUser(householdId);
      await prisma.user.update({
        where: { id: quiet },
        data: { name: "No Number Nora" },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { name: "Unticked Uma" },
      });
      await saveOwnPhone(userId, "(508) 555-1212", false);

      const audience = await shoppingListAudience(householdId);
      expect(audience.withoutConsent).toEqual(["Unticked Uma"]);
      expect(audience.withoutNumber).toEqual(["No Number Nora"]);
    });

    it("includes somebody who did agree", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", true);

      const audience = await shoppingListAudience(householdId);
      expect(audience.recipients.map((r) => r.phone)).toEqual(["+15085551212"]);
      expect(audience.withoutConsent).toEqual([]);
    });

    it("counts a number carried over from before the box existed", async () => {
      // The migration marks these IMPORTED rather than CHECKBOX, and they are
      // reachable: the household kept working across the deploy.
      await prisma.user.update({
        where: { id: userId },
        data: {
          phone: "+15085551212",
          smsConsentAt: new Date(),
          smsConsentSource: SmsConsentSource.IMPORTED,
        },
      });

      const audience = await shoppingListAudience(householdId);
      expect(audience.recipients).toHaveLength(1);
    });
  });

  describe("what the household page shows", () => {
    it("reports each member's agreement, not just their number", async () => {
      await saveOwnPhone(userId, "(508) 555-1212", false);

      const household = await getHousehold(householdId);
      const me = household?.members.find((m) => m.id === userId);
      expect(me?.phone).toBe("+15085551212");
      expect(me?.smsConsented).toBe(false);
    });
  });
});

/**
 * The wording is shared rather than retyped, because a carrier reviewing the
 * campaign compares the box against the public pages and rejects a mismatch.
 * These assert the pieces they check for are actually in the strings.
 */
describe("the disclosures", () => {
  it("says who is texting and how often, on the box itself", () => {
    expect(SMS_CONSENT_LABEL).toContain("McMullen Meal Magic");
    expect(SMS_CONSENT_LABEL).toContain(SMS_FREQUENCY);
  });

  it("promises in the words the reviewer scans for that numbers are not shared", () => {
    // The single most common reason a 10DLC registration is refused, and this
    // campaign was refused once for saying it in better English than this.
    // All three verbs, because a reviewer scanning for the phrase reads two
    // missing ones as an omission rather than as concision.
    expect(SMS_NO_SHARING).toMatch(/do not share, sell, or provide/i);
    expect(SMS_NO_SHARING).toMatch(/third parties or affiliates/i);
    expect(SMS_NO_SHARING).toMatch(/marketing or promotional purposes/i);
  });

  it("says what Twilio is to us, not only that it is involved", () => {
    // "The number is passed to Twilio" on its own reads as disclosure of
    // sharing and contradicts the sentence above - which is refused as
    // conflicting information rather than as a missing statement.
    expect(SMS_PROVIDER).toMatch(/service provider/i);
    expect(SMS_PROVIDER).toMatch(/not a marketing partner/i);
  });
});
