import { claimedAssistant } from "./destination";

/**
 * Turns the request log into what /admin/assistants shows: sentences instead
 * of tool names, visits instead of rows, and the summary strip. Drawn on the
 * board https://claude.ai/artifact/Bkrx4QPg1WjvdnAU9SRKpG (B, with C's
 * strip). Every word comes from the tool, its arguments and the facts kept
 * from its answer; nothing is guessed about what the person typed.
 */

export type LogRow = {
  id: string;
  createdAt: Date;
  method: string;
  tool: string | null;
  arguments: string | null;
  status: number;
  outcome: string;
  detail: string | null;
  result: string | null;
  userId: string | null;
  clientId: string | null;
  assistant: string | null;
  user: { name: string; household: { name: string } | null } | null;
};

/** A sentence in pieces, so a page can set the names in bold. */
export type Words = { text: string; strong?: boolean }[];

export type Line = {
  id: string;
  at: Date;
  words: Words;
  /** A quiet fact after the sentence: "54 found". */
  note: string | null;
  flag: "ERROR" | "REFUSED" | null;
};

/** Connection housekeeping every assistant does; hidden unless asked. */
const HANDSHAKES = new Set([
  "initialize",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
  "ping",
]);

export const isHandshake = (row: Pick<LogRow, "method">) =>
  HANDSHAKES.has(row.method) || row.method.startsWith("notifications/");

function json(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const num = (value: unknown) => (typeof value === "number" ? value : null);

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Thursday 20 Nov" from a plan date, read as the calendar day it is. */
function planDay(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${month}`;
}

const SLOT_WORDS: Record<string, string> = {
  DINNER: "dinner",
  DINNER_2: "a second main",
  DINNER_3: "a third main",
  SIDE: "the side",
};

/** One logged call, as a sentence. */
export function lineFor(row: LogRow): Line {
  const args = json(row.arguments);
  const facts = json(row.result);
  const base = { id: row.id, at: row.createdAt, note: null, flag: null };

  if (row.outcome === "refused") {
    const why =
      row.status === 401
        ? "no sign-in"
        : row.status === 403
          ? "this assistant was disconnected"
          : row.status === 429
            ? "over the daily allowance"
            : `status ${row.status}`;
    return { ...base, words: [{ text: `Refused: ${why}` }], flag: "REFUSED" };
  }

  const failed = row.outcome === "error";
  const plain = (text: string): Words => [{ text }];
  let words: Words;
  let note: string | null = null;

  switch (row.tool) {
    case "search_recipes": {
      const query = str(args.query);
      const tag = str(args.tag);
      words = query
        ? [{ text: "Searched for " }, { text: `“${query}”`, strong: true }]
        : tag
          ? [{ text: "Listed recipes tagged " }, { text: tag, strong: true }]
          : plain("Listed recipes");
      const total = num(facts.total);
      if (total !== null) note = `${total} found`;
      break;
    }
    case "get_recipe":
      words = failed
        ? plain("Tried to open a recipe that isn’t in the library")
        : str(facts.title)
          ? [{ text: "Opened " }, { text: str(facts.title)!, strong: true }]
          : plain("Opened a recipe");
      break;
    case "get_week":
      words = plain("Looked at the week’s plan");
      break;
    case "get_shopping_list": {
      words = plain("Read the shopping list");
      const items = num(facts.items);
      if (items !== null) note = `${items} ${items === 1 ? "item" : "items"}`;
      break;
    }
    case "get_pantry":
      words = plain("Looked at the pantry");
      break;
    case "suggest_dinners": {
      words = plain("Asked for dinner suggestions");
      const n = num(facts.suggested);
      if (n !== null) note = `${n} suggested`;
      break;
    }
    case "import_recipe_link": {
      let host: string | null = null;
      try {
        host = new URL(String(args.url)).hostname.replace(/^www\./, "");
      } catch {
        host = null;
      }
      words = host
        ? [
            { text: "Made an import link for a page on " },
            { text: host, strong: true },
          ]
        : plain("Made an import link");
      break;
    }
    case "plan_dinner": {
      const day = planDay(str(facts.date) ?? str(args.date));
      const slot = SLOT_WORDS[String(facts.slot ?? args.slot ?? "DINNER")];
      if (failed) {
        words = plain(`Tried to plan ${day ? `for ${day}` : "a dinner"}`);
      } else if (str(facts.planned)) {
        words = [
          { text: "Planned " },
          { text: str(facts.planned)!, strong: true },
          { text: ` for ${slot ?? "dinner"}${day ? ` on ${day}` : ""}` },
        ];
        if (str(facts.replaced)) note = `replacing ${str(facts.replaced)}`;
      } else {
        words = str(facts.removed)
          ? [
              { text: "Took " },
              { text: str(facts.removed)!, strong: true },
              { text: ` off ${day ?? "the plan"}` },
            ]
          : plain(`Cleared ${day ?? "a day"}`);
      }
      break;
    }
    case "add_pantry_item":
    case "add_to_list": {
      const name = str(facts.added) ?? str(args.name);
      const where = row.tool === "add_pantry_item" ? "the pantry" : "the list";
      words = name
        ? [
            { text: "Added " },
            { text: name, strong: true },
            { text: ` to ${where}` },
          ]
        : plain(`Added to ${where}`);
      break;
    }
    default:
      words = plain(
        row.method === "prompts/get"
          ? "Used one of Trivet’s ready-made asks"
          : (row.tool ?? row.method),
      );
  }

  return {
    ...base,
    words,
    note: failed ? null : note,
    flag: failed ? "ERROR" : null,
  };
}

/** The assistant's name as people know it: Gemini registers as "Google". */
export function assistantName(row: Pick<LogRow, "assistant">): string {
  if (!row.assistant) return "an unknown assistant";
  return claimedAssistant(row.assistant) ?? row.assistant;
}

export type Visit = {
  key: string;
  person: string | null;
  household: string | null;
  assistant: string;
  start: Date;
  end: Date;
  lines: Line[];
  problems: number;
  headline: string;
};

/** Calls further apart than this start a new visit. */
export const VISIT_GAP_MS = 10 * 60 * 1000;

function headlineFor(rows: LogRow[], lines: Line[]): string {
  const ok = rows.filter((r) => r.outcome === "ok");
  const firstQuery = ok
    .filter((r) => r.tool === "search_recipes")
    .map((r) => str(json(r.arguments).query))
    .find(Boolean);
  const opened = ok
    .filter((r) => r.tool === "get_recipe")
    .map((r) => str(json(r.result).title))
    .find(Boolean);
  const planned = ok
    .filter((r) => r.tool === "plan_dinner")
    .map((r) => str(json(r.result).planned))
    .filter((t): t is string => Boolean(t));
  const added = ok
    .filter((r) => r.tool === "add_to_list" || r.tool === "add_pantry_item")
    .map((r) => str(json(r.result).added) ?? str(json(r.arguments).name))
    .filter((t): t is string => Boolean(t));

  const LOOKS: Record<string, string> = {
    get_week: "Checked the week",
    get_shopping_list: "Read the list",
    get_pantry: "Checked the pantry",
    suggest_dinners: "Asked for dinner ideas",
  };
  const first = firstQuery
    ? `Looking for “${firstQuery}”`
    : opened
      ? `Opened ${opened}`
      : ok.map((r) => LOOKS[r.tool ?? ""]).find(Boolean);

  const parts = [
    first,
    planned.length ? `planned ${planned.join(" and ")}` : null,
    added.length ? `added ${added.join(", ")}` : null,
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) {
    return lines[0]?.words.map((w) => w.text).join("") ?? "";
  }
  const sentence = parts.join(", then ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Rows grouped into visits: one person's assistant, calls no more than
 * VISIT_GAP_MS apart. Refusals with nobody signed in group by assistant
 * alone. Newest visit first; calls inside a visit oldest first.
 */
export function groupVisits(newestFirst: LogRow[]): Visit[] {
  const rows = [...newestFirst].reverse();
  const visits: { rows: LogRow[] }[] = [];
  const open = new Map<string, { rows: LogRow[] }>();

  for (const row of rows) {
    const who = `${row.userId ?? "nobody"}|${row.clientId ?? "none"}`;
    const current = open.get(who);
    const last = current?.rows[current.rows.length - 1];
    if (
      current &&
      last &&
      row.createdAt.getTime() - last.createdAt.getTime() <= VISIT_GAP_MS
    ) {
      current.rows.push(row);
    } else {
      const visit = { rows: [row] };
      visits.push(visit);
      open.set(who, visit);
    }
  }

  return visits.reverse().map(({ rows: group }) => {
    const lines = group.map(lineFor);
    const first = group[0];
    return {
      key: first.id,
      person: first.user?.name ?? null,
      household: first.user?.household?.name ?? null,
      assistant: assistantName(first),
      start: first.createdAt,
      end: group[group.length - 1].createdAt,
      lines,
      problems: lines.filter((l) => l.flag).length,
      headline: first.user
        ? headlineFor(group, lines)
        : lines[0].words.map((w) => w.text).join(""),
    };
  });
}

export type Summary = {
  calls: number;
  visits: number;
  people: number;
  households: number;
  byAssistant: { name: string; calls: number }[];
  mostSearched: string[];
  problems: number;
};

/** The strip across the top. */
export function summarize(rows: LogRow[], visits: Visit[]): Summary {
  const signedIn = rows.filter((r) => r.userId);
  const byAssistant = new Map<string, number>();
  for (const row of signedIn) {
    const name = assistantName(row);
    byAssistant.set(name, (byAssistant.get(name) ?? 0) + 1);
  }
  const searched = new Map<string, number>();
  for (const row of rows) {
    if (row.tool !== "search_recipes" || row.outcome !== "ok") continue;
    const query = str(json(row.arguments).query)?.toLowerCase();
    if (query) searched.set(query, (searched.get(query) ?? 0) + 1);
  }
  return {
    calls: rows.length,
    visits: visits.length,
    people: new Set(signedIn.map((r) => r.userId)).size,
    households: new Set(
      signedIn.map((r) => r.user?.household?.name).filter(Boolean),
    ).size,
    byAssistant: [...byAssistant]
      .map(([name, calls]) => ({ name, calls }))
      .sort((a, b) => b.calls - a.calls),
    mostSearched: [...searched]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query]) => query),
    problems: rows.filter((r) => r.outcome !== "ok").length,
  };
}
