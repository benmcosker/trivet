/**
 * What to call the week on screen, and how to write its dates.
 *
 * Import-free, so the planner (a client component) can use it and it tests
 * without a browser.
 */

/**
 * Month names spelled out here rather than read from `toLocaleDateString`.
 *
 * The page is rendered twice, once on the server and once in the browser, and
 * the two only agree about `Intl` if they were built against the same ICU
 * data. A header that says "September" on one pass and "Sept" on the other is
 * a hydration mismatch, and this app has exactly one locale.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The page's heading. The planner shows this week or next and no other -
 * `/plan` sends any other week back to this one - so those are the only two
 * names a week needs.
 */
export function weekName(weekStartIso: string, thisWeekIso: string): string {
  return weekStartIso === addDaysIso(thisWeekIso, 7)
    ? "Next week"
    : "This week";
}

/**
 * "14–20 September", or "28 September – 4 October" when it straddles one.
 *
 * No year: the planner only ever shows this week or the next, and "2026" in
 * an eyebrow is the sort of precision nobody asked for.
 */
export function formatWeekRange(startIso: string): string {
  const endIso = addDaysIso(startIso, 6);
  const [, startMonth, startDay] = startIso.split("-").map(Number);
  const [, endMonth, endDay] = endIso.split("-").map(Number);

  return startMonth === endMonth
    ? `${startDay}–${endDay} ${MONTHS[endMonth - 1]}`
    : `${startDay} ${MONTHS[startMonth - 1]} – ${endDay} ${MONTHS[endMonth - 1]}`;
}
