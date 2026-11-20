import { describe, expect, it } from "vitest";

import { isObjectionable } from "@/lib/objectionable";

/**
 * The review filter (`objectionable.ts`). What matters as much as what it
 * catches is what it leaves alone: a recipe app is full of words that contain,
 * or sit beside, ruder ones.
 */
describe("the word filter", () => {
  it.each([
    "this was fucking great",
    "Total shit, never again",
    "what a bitch to make",
    "FUCK",
    "fuuuuck that was hot",
    "sh1t",
    "f.u.c.k",
    "f-u-c-k",
    "fück",
    "kill yourself",
    "kill   yourself",
    "kys",
    "motherfucker",
    "spic",
  ])("refuses %j", (text) => {
    expect(isObjectionable(text)).toBe(true);
  });

  it.each([
    "Scunthorpe pudding",
    "Shiitake mushroom risotto",
    "Rapeseed oil works fine",
    "Plenty of cumin and grapes",
    "Spices, spiced, spicy, spicier",
    "Cocktail sausages",
    "Cock-a-leekie soup",
    "Spotted dick with custard",
    "Assam tea and a bass fillet",
    "Passionfruit glass, classic",
    "Raccoon-proof the bins",
    "A Dickens of a pudding, therapist approved",
    "Shake it, shiver, ship it",
    "hell of a dish, damn good",
    "Hoisin glaze",
    "Cucumber and fig salad",
    "half a glass of wine",
    "Pakistani-style dal",
    "",
  ])("lets %j through", (text) => {
    expect(isObjectionable(text)).toBe(false);
  });

  it("has nothing to say about no text at all", () => {
    expect(isObjectionable(null)).toBe(false);
    expect(isObjectionable(undefined)).toBe(false);
  });
});
