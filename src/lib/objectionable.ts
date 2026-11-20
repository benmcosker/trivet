/**
 * Words Trivet won't publish where other households can read them.
 *
 * App Store guideline 1.2: an app with content people write for each other
 * needs a way to filter objectionable material before it is posted, beside
 * reporting and blocking (`moderation.ts`). In Trivet that writing is a
 * review's text, the name a person signs up with (shown on their reviews) and
 * a household's name (shown on its reviews and shares). Each of those is
 * checked on the server before it is saved; recipes are not, because they
 * reach another household only when somebody chooses to share one.
 *
 * Deliberately short, and limited to slurs, sexual terms and the strongest
 * swearing. A filter that refuses "this was damn good" teaches people to
 * work around it; one that refuses a slur is doing its job. Reports and
 * hiding a household catch what a list cannot.
 *
 * A plain module with no database access, so the review form can check as
 * the person types and the server can check again.
 *
 * Matching is by whole word, with a few endings ("s", "ed", "ing", ...), so a
 * word inside another word is left alone: Scunthorpe, shiitake, rapeseed,
 * cumin. Letters may be repeated ("fuuuck"), swapped for look-alike digits or
 * symbols ("sh1t", "@ss"), or split by dots, dashes or underscores
 * ("f.u.c.k"). Spaces are not treated as a split, or two innocent words side
 * by side could spell something.
 *
 * Food words that happen to be rude are left off on purpose - cock-a-leekie,
 * spotted dick, faggots (the British meatballs are refused anyway: the word's
 * other meaning is a slur, and a review can say "meatballs") - and
 * `test/objectionable.test.ts` keeps a list of dishes that must get through.
 */

const WORDS = [
  // Swearing, at the strong end only.
  "fuck",
  "motherfucker",
  "fucker",
  "shit",
  "bullshit",
  "cunt",
  "bitch",
  "asshole",
  "arsehole",
  "dickhead",
  "wanker",
  "twat",
  // Sexual.
  "porn",
  "porno",
  "dildo",
  "blowjob",
  "handjob",
  "jizz",
  "slut",
  "whore",
  "rape",
  "rapist",
  // Slurs.
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "dyke",
  "tranny",
  "retard",
  "spic",
  "kike",
  "chink",
  "gook",
  "wetback",
  "raghead",
  "towelhead",
  "paki",
  "coon",
];

/** Several words, matched with any run of spaces between them. */
const PHRASES = ["kill yourself", "kill urself"];

/** Stand-alone abbreviations, matched exactly. */
const ABBREVIATIONS = ["kys", "stfu"];

const ENDINGS = "(?:s|es|ed|er|ers|ing)?";

/**
 * Words matched with no endings at all, because an ending turns them into
 * food: "spic" plus "es" is "spices", plus "ed" is "spiced".
 */
const NO_ENDINGS = new Set(["spic"]);

/** Look-alikes for each letter, as a character class. */
const LOOKALIKES: Record<string, string> = {
  a: "a@4",
  e: "e3",
  i: "i1!|",
  o: "o0",
  s: "s$5",
  t: "t7+",
  g: "g9",
  l: "l1|",
};

/** Dots, dashes, underscores and asterisks may separate letters. */
const SPLIT = "[._*\\-]?";

function letter(char: string): string {
  const chars = (LOOKALIKES[char] ?? char).replace(/[\\\]^-]/g, "\\$&");
  return `[${chars}]+`;
}

function wordPattern(word: string): string {
  return [...word].map(letter).join(SPLIT);
}

/** Not preceded or followed by a letter or digit. */
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

const PATTERN = new RegExp(
  [
    ...WORDS.map(
      (word) =>
        `${BEFORE}${wordPattern(word)}${NO_ENDINGS.has(word) ? "" : ENDINGS}${AFTER}`,
    ),
    ...PHRASES.map(
      (phrase) =>
        `${BEFORE}${phrase.split(" ").map(wordPattern).join("\\s+")}${AFTER}`,
    ),
    ...ABBREVIATIONS.map((word) => `${BEFORE}${word}${AFTER}`),
  ].join("|"),
  "iu",
);

/**
 * Whether the text contains a word Trivet won't publish. Accents are
 * ignored, so "fück" is read as "fuck".
 */
export function isObjectionable(text: string | null | undefined): boolean {
  if (!text) return false;
  const plain = text.normalize("NFKD").replace(/\p{M}/gu, "");
  return PATTERN.test(plain);
}

/**
 * What to say when something is refused. It doesn't repeat the word: the
 * person knows which one it was, and an error message that prints slurs is
 * its own problem.
 */
export const OBJECTIONABLE_REFUSAL = {
  review:
    "That review includes language Trivet doesn't publish. Reword it and save again.",
  name: "That name includes language Trivet doesn't allow. Choose another.",
} as const;
