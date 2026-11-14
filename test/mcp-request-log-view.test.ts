import { describe, expect, it } from "vitest";

import {
  groupVisits,
  isHandshake,
  lineFor,
  summarize,
  type LogRow,
} from "@/lib/mcp/request-log-view";

/** /admin/assistants: sentences, visits and the strip, from log rows. */
let n = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 14, minute));
const ben = { name: "Ben", household: { name: "McOsker/Mullen" } };
function row(over: Partial<LogRow>): LogRow {
  n += 1;
  return {
    id: `r${n}`,
    createdAt: at(0),
    method: "tools/call",
    tool: null,
    arguments: null,
    status: 200,
    outcome: "ok",
    detail: null,
    result: null,
    userId: "ben",
    clientId: "chatgpt",
    assistant: "ChatGPT",
    user: ben,
    ...over,
  };
}
const text = (r: LogRow) =>
  lineFor(r)
    .words.map((w) => w.text)
    .join("");

describe("lineFor", () => {
  it("says what a call did, in words", () => {
    expect(
      text(row({ tool: "search_recipes", arguments: '{"query":"chicken"}' })),
    ).toBe("Searched for “chicken”");
    expect(
      lineFor(
        row({
          tool: "search_recipes",
          arguments: "{}",
          result: '{"total":54}',
        }),
      ).note,
    ).toBe("54 found");
    expect(
      text(
        row({
          tool: "plan_dinner",
          arguments: '{"date":"2026-11-19"}',
          result:
            '{"planned":"Skillet Chicken Parm","date":"2026-11-19","slot":"DINNER"}',
        }),
      ),
    ).toBe("Planned Skillet Chicken Parm for dinner on Thursday 19 Nov");
    expect(
      text(row({ tool: "add_to_list", arguments: '{"name":"dish soap"}' })),
    ).toBe("Added dish soap to the list");
  });

  it("flags errors and refusals plainly", () => {
    const missing = lineFor(
      row({ tool: "get_recipe", arguments: '{"id":"nope"}', outcome: "error" }),
    );
    expect(missing.flag).toBe("ERROR");
    expect(missing.words[0].text).toBe(
      "Tried to open a recipe that isn’t in the library",
    );
    expect(
      text(row({ outcome: "refused", status: 401, userId: null, user: null })),
    ).toBe("Refused: no sign-in");
    expect(text(row({ outcome: "refused", status: 403 }))).toBe(
      "Refused: this assistant was disconnected",
    );
  });

  it("tells handshakes from calls", () => {
    expect(isHandshake({ method: "initialize" })).toBe(true);
    expect(isHandshake({ method: "notifications/initialized" })).toBe(true);
    expect(isHandshake({ method: "tools/call" })).toBe(false);
  });
});

describe("groupVisits", () => {
  it("groups one person's calls minutes apart, and starts again after a gap", () => {
    const newestFirst = [
      row({ createdAt: at(40), tool: "get_week" }),
      row({
        createdAt: at(2),
        tool: "plan_dinner",
        result: '{"planned":"Skillet Chicken Parm","date":"2026-11-19"}',
      }),
      row({
        createdAt: at(1),
        tool: "get_recipe",
        result: '{"title":"Schnitzel"}',
      }),
      row({
        createdAt: at(0),
        tool: "search_recipes",
        arguments: '{"query":"chicken"}',
      }),
    ];
    const visits = groupVisits(newestFirst);
    expect(visits).toHaveLength(2);
    expect(visits[0].headline).toBe("Checked the week");
    expect(visits[1].lines).toHaveLength(3);
    expect(visits[1].headline).toBe(
      "Looking for “chicken”, then planned Skillet Chicken Parm",
    );
    expect(visits[1].assistant).toBe("ChatGPT");
  });

  it("keeps different assistants apart, and names Gemini as Gemini", () => {
    const visits = groupVisits([
      row({
        createdAt: at(1),
        clientId: "g",
        assistant: "Google",
        tool: "get_week",
      }),
      row({ createdAt: at(0), tool: "get_pantry" }),
    ]);
    expect(visits.map((v) => v.assistant)).toEqual(["Gemini", "ChatGPT"]);
  });
});

describe("summarize", () => {
  it("counts calls, people, assistants, searches and problems", () => {
    const rows = [
      row({ tool: "search_recipes", arguments: '{"query":"Chicken"}' }),
      row({ tool: "search_recipes", arguments: '{"query":"chicken"}' }),
      row({ tool: "search_recipes", arguments: '{"query":"grouper"}' }),
      row({
        tool: "get_recipe",
        outcome: "error",
        clientId: "c",
        assistant: "Claude",
      }),
      row({
        outcome: "refused",
        status: 401,
        userId: null,
        user: null,
        clientId: null,
        assistant: null,
      }),
    ];
    const s = summarize(rows, groupVisits(rows));
    expect(s.calls).toBe(5);
    expect(s.people).toBe(1);
    expect(s.households).toBe(1);
    expect(s.byAssistant).toEqual([
      { name: "ChatGPT", calls: 3 },
      { name: "Claude", calls: 1 },
    ]);
    expect(s.mostSearched).toEqual(["chicken", "grouper"]);
    expect(s.problems).toBe(2);
  });
});
