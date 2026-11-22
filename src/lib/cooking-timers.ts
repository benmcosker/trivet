/**
 * Cooking timers: finding the times in a step, and the state a running timer
 * keeps. Import-free, like `cooking.ts`, so the parts worth testing run
 * without a browser.
 */

/** Most timers at once. Four is a kitchen you are losing. */
export const MAX_TIMERS = 3;

/** How long after a timer ended it is still remembered, in milliseconds. */
const KEEP_AFTER_END_MS = 60 * 60 * 1000;

export type StepDuration = {
  /** What the button says: "5–8 min", "1 hr 30 min". */
  display: string;
  /** Seconds a timer started from it runs. A range starts at its low end. */
  seconds: number;
  /** The word the clause leads in with: "simmer", "rest". Empty if none. */
  label: string;
};

const UNIT_SECONDS: Record<string, number> = {
  hour: 3600,
  hours: 3600,
  hr: 3600,
  hrs: 3600,
  minute: 60,
  minutes: 60,
  min: 60,
  mins: 60,
  second: 1,
  seconds: 1,
  sec: 1,
  secs: 1,
};

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

/** "5", "1.5", "1½" or "½" as a number. */
function toNumber(raw: string): number {
  const text = raw.replace(/\s/g, "").replace(",", ".");
  const last = text.slice(-1);
  if (last in FRACTIONS) {
    const whole = text.slice(0, -1);
    return (whole ? Number(whole) : 0) + FRACTIONS[last];
  }
  return Number(text);
}

function unitName(unit: string): string {
  const key = unit.toLowerCase();
  return key.startsWith("h") ? "hr" : key.startsWith("m") ? "min" : "sec";
}

const NUM = String.raw`(?:\d+(?:[.,]\d+)?\s?[½¼¾]?|[½¼¾])`;
const DURATION = new RegExp(
  String.raw`(${NUM})(?:\s?(?:-|–|—|to)\s?(${NUM}))?(\s?)(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  "gi",
);

const FILLER = new Set([
  "for",
  "about",
  "approximately",
  "another",
  "additional",
  "an",
  "a",
  "the",
  "of",
  "to",
  "until",
  "over",
  "up",
  "and",
  "then",
  "it",
  "them",
  "around",
  "roughly",
  "at",
  "least",
  "most",
]);

/** The word a clause leads into a duration with, from the text before it. */
function leadWord(before: string): string {
  const clause = before.split(/[.;:!?,\n]/).pop() ?? "";
  const words = clause
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w && !FILLER.has(w));
  return words[words.length - 1] ?? "";
}

type Found = {
  start: number;
  end: number;
  seconds: number;
  isHours: boolean;
  display: string;
};

function format(parts: { value: number; unit: string }[]): string {
  return parts.map((p) => `${trim(p.value)} ${p.unit}`).join(" ");
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * The durations in one step of a method.
 *
 * What counts is a number, a unit and a space (or nothing) between them:
 * "simmer 5 minutes", "5min". What does not is a hyphen between them - "a
 * 15-minute walk", "a 20-minute marinade" are adjectives about something
 * else, not an instruction to wait. A miss costs a tap on a manual timer
 * nobody has yet; a button that starts the wrong time is worse, so the parser
 * errs towards missing.
 *
 * A range starts at its low end, shown whole: "5–8 min" runs five minutes.
 * "1 hour 30 minutes" is one timer of ninety.
 */
export function findDurations(step: string): StepDuration[] {
  const found: Found[] = [];
  for (const match of step.matchAll(DURATION)) {
    // "15-minute" never matches at all: only a space, or nothing, may sit
    // between the number and its unit, and a range's own hyphen is part of
    // the pattern.
    const [whole, low, high, , unit] = match;
    if (!UNIT_SECONDS[unit.toLowerCase()]) continue;
    const lowN = toNumber(low);
    if (!Number.isFinite(lowN) || lowN <= 0) continue;
    const unitSec = UNIT_SECONDS[unit.toLowerCase()];
    const shortUnit = unitName(unit);
    const highN = high ? toNumber(high) : null;
    const range = highN !== null && Number.isFinite(highN) && highN > lowN;
    found.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + whole.length,
      seconds: Math.round(lowN * unitSec),
      isHours: unitSec === 3600,
      display: range
        ? `${trim(lowN)}–${trim(highN as number)} ${shortUnit}`
        : `${trim(lowN)} ${shortUnit}`,
    });
  }

  // "1 hour 30 minutes" or "1 hour and 30 minutes": one duration, not two.
  const merged: Found[] = [];
  for (const item of found) {
    const prev = merged[merged.length - 1];
    const gapText = prev ? step.slice(prev.end, item.start) : "";
    if (prev && prev.isHours && /^\s*(?:and\s+)?$/i.test(gapText)) {
      const hours = prev.seconds / 3600;
      const minutes = item.seconds / 60;
      prev.seconds += item.seconds;
      prev.end = item.end;
      prev.isHours = false;
      prev.display = format([
        { value: hours, unit: "hr" },
        { value: minutes, unit: "min" },
      ]);
    } else {
      merged.push({ ...item });
    }
  }

  return merged.map((item) => ({
    display: item.display,
    seconds: item.seconds,
    label: leadWord(step.slice(0, item.start)),
  }));
}

/** What a timer of this many seconds is called: "5 min", "1 hr 30 min". */
export function describeSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hr`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} sec`);
  return parts.join(" ");
}

export type CookingTimer = {
  id: string;
  /** The step it was started on, 0-based. */
  step: number;
  /** "simmer", or empty. */
  label: string;
  /** Epoch milliseconds. Absolute, so a reload or a sleeping phone is right. */
  endsAt: number;
  /** What it was started for, so a finished one can say so. */
  display: string;
};

/**
 * Timers out of what storage holds, and nothing it should not.
 *
 * The stored value is whatever was last written, possibly by an older build
 * or by hand, so every field is checked. A timer that ended more than an hour
 * ago is dropped: it was rung and left, and keeping it would make "finished
 * three days ago" a permanent fixture of the screen.
 */
export function parseTimers(raw: string | null, now: number): CookingTimer[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const timers: CookingTimer[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (
      typeof t.id !== "string" ||
      typeof t.step !== "number" ||
      typeof t.label !== "string" ||
      typeof t.endsAt !== "number" ||
      typeof t.display !== "string" ||
      !Number.isFinite(t.endsAt)
    ) {
      continue;
    }
    if (t.endsAt < now - KEEP_AFTER_END_MS) continue;
    timers.push({
      id: t.id,
      step: t.step,
      label: t.label,
      endsAt: t.endsAt,
      display: t.display,
    });
  }
  return timers.slice(0, MAX_TIMERS);
}

/** "3:20", "0:05", "1:02:09". Rounds up so it never says 0:00 while running. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Spoken form for a screen reader: "3 minutes 20 seconds". */
export function spokenCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (s || parts.length === 0) {
    parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  }
  return parts.join(" ");
}
