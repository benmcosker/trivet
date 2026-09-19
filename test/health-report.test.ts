import { describe, expect, it } from "vitest";

import {
  bump,
  buildReport,
  daysUntil,
  needsAttention,
  summariseAudit,
  summariseCredentials,
  summariseOutdated,
  summariseRuntimes,
  // Plain JS, so the workflow can run it straight after npm ci.
} from "../scripts/health-report.mjs";

const advisory = (over = {}) => ({
  severity: "high",
  isDirect: false,
  fixAvailable: true,
  ...over,
});

describe("bump", () => {
  it("tells a project apart from a chore", () => {
    expect(bump("1.2.3", "2.0.0")).toBe("major");
    expect(bump("1.2.3", "1.3.0")).toBe("minor");
    expect(bump("1.2.3", "1.2.4")).toBe("patch");
  });

  it("has nothing to say when nothing moved", () => {
    expect(bump("1.2.3", "1.2.3")).toBeNull();
    expect(bump(undefined, "1.2.3")).toBeNull();
  });

  it("copes with a leading range character", () => {
    // npm reports "current" bare but a package.json range is "^1.2.3".
    expect(bump("^1.2.3", "2.0.0")).toBe("major");
  });
});

describe("summariseAudit", () => {
  const audit = {
    vulnerabilities: {
      next: advisory({ severity: "critical", isDirect: true }),
      eslint: advisory({ severity: "high" }),
      chalk: advisory({ severity: "low" }),
    },
  };

  it("reports moderate and above, and leaves the noise out", () => {
    const summary = summariseAudit(audit, { vulnerabilities: {} });
    expect(summary.total).toBe(3);
    expect(summary.reportable.map((a: { name: string }) => a.name)).toEqual([
      "next",
      "eslint",
    ]);
  });

  /*
   * The number that decides whether a Monday matters. Reaching a dev-only
   * advisory means running the toolchain; reaching a production one means
   * sending a request, and those deserve different urgency.
   */
  it("counts separately what a request could reach", () => {
    const summary = summariseAudit(audit, {
      vulnerabilities: { next: advisory({ severity: "critical" }) },
    });
    expect(summary.production.map((a: { name: string }) => a.name)).toEqual([
      "next",
    ]);
  });

  it("marks a fix that is itself a major, because that is not a Tuesday job", () => {
    const summary = summariseAudit(
      {
        vulnerabilities: {
          prisma: advisory({ fixAvailable: { isSemVerMajor: true } }),
        },
      },
      {},
    );
    expect(summary.reportable[0].breaking).toBe(true);
  });

  it("says when there is no fix to apply yet", () => {
    const summary = summariseAudit(
      { vulnerabilities: { sharp: advisory({ fixAvailable: false }) } },
      {},
    );
    expect(summary.reportable[0].fixable).toBe(false);
  });

  it("survives npm saying nothing at all", () => {
    expect(summariseAudit({}, {}).total).toBe(0);
    expect(summariseAudit(undefined, undefined).reportable).toEqual([]);
  });
});

describe("needsAttention", () => {
  const clear = {
    audit: { reportable: [], production: [], total: 0 },
    outdated: { major: [], minor: [], patch: [] },
    drift: false,
  };

  it("stays quiet when there is nothing to do", () => {
    expect(needsAttention(clear)).toBe(false);
  });

  /*
   * Patches alone are not worth an issue. They arrive constantly, npm audit
   * speaks up when one of them matters, and a weekly notice nobody needs to
   * act on is how people learn to skip the notice that does matter.
   */
  it("does not wake anybody for patch releases alone", () => {
    expect(
      needsAttention({
        ...clear,
        outdated: { major: [], minor: [], patch: [{}, {}] },
      }),
    ).toBe(false);
  });

  it("speaks up for drift, advisories or a real version gap", () => {
    expect(needsAttention({ ...clear, drift: true })).toBe(true);
    expect(
      needsAttention({ ...clear, audit: { ...clear.audit, reportable: [{}] } }),
    ).toBe(true);
    expect(
      needsAttention({
        ...clear,
        outdated: { major: [{}], minor: [], patch: [] },
      }),
    ).toBe(true);
  });
});

describe("buildReport", () => {
  const report = {
    audit: summariseAudit(
      {
        vulnerabilities: {
          next: advisory({ severity: "critical", isDirect: true }),
        },
      },
      { vulnerabilities: { next: advisory() } },
    ),
    outdated: summariseOutdated({
      typescript: { current: "5.9.3", latest: "7.0.2" },
      zod: { current: "4.4.3", latest: "4.5.4" },
    }),
    drift: true,
    versions: { node: "v22.22.2" },
    date: "2026-09-09",
  };

  it("names the advisory, the majors and the drift", () => {
    const body = buildReport(report);
    expect(body).toContain("**next** - critical, direct dependency");
    expect(body).toContain("**typescript** 5.9.3 → 7.0.2");
    expect(body).toContain("- zod 4.4.3 → 4.5.4");
    expect(body).toContain("**Drift**");
  });

  it("says so plainly when the schema is fine", () => {
    expect(buildReport({ ...report, drift: false })).toContain(
      "Migrations match the schema",
    );
  });

  it("writes _None._ rather than an empty heading", () => {
    const empty = {
      ...report,
      audit: summariseAudit({}, {}),
      outdated: summariseOutdated({}),
    };
    expect(buildReport(empty)).toContain("_None._");
  });
});

const TODAY = new Date("2026-09-09T00:00:00.000Z");

describe("daysUntil", () => {
  it("counts forward and back", () => {
    expect(daysUntil("2026-09-19", TODAY)).toBe(10);
    expect(daysUntil("2026-08-30", TODAY)).toBe(-10);
  });
});

describe("summariseRuntimes", () => {
  const runtimes = [{ product: "nodejs", cycle: "22", used: "Vercel" }];

  it("says how long is left when the end is in sight", () => {
    const [only] = summariseRuntimes(
      runtimes,
      { "nodejs/22": { eol: "2026-11-08" } },
      TODAY,
      180,
    );
    expect(only.state).toBe("soon");
    expect(only.days).toBe(60);
  });

  it("says when support has already ended", () => {
    const [only] = summariseRuntimes(
      runtimes,
      { "nodejs/22": { eol: "2026-01-01" } },
      TODAY,
      180,
    );
    expect(only.state).toBe("ended");
  });

  it("is quiet about a date comfortably far off", () => {
    const [only] = summariseRuntimes(
      runtimes,
      { "nodejs/22": { eol: "2028-04-30" } },
      TODAY,
      180,
    );
    expect(only.state).toBe("supported");
  });

  it("handles a cycle with no announced end", () => {
    // endoflife.date answers `false` rather than a date for these.
    const [only] = summariseRuntimes(
      runtimes,
      { "nodejs/22": { eol: false } },
      TODAY,
      180,
    );
    expect(only.state).toBe("supported");
    expect(only.eol).toBeNull();
  });

  /*
   * The important one. A lookup that fails must not read as "fine" - a check
   * that silently answers nothing every week is worse than no check, because
   * it looks like one.
   */
  it("says it could not check, rather than nothing", () => {
    const [only] = summariseRuntimes(runtimes, {}, TODAY, 180);
    expect(only.state).toBe("unknown");
    expect(
      needsAttention({
        audit: { reportable: [], production: [], total: 0 },
        outdated: { major: [], minor: [], patch: [] },
        drift: false,
        runtimes: [only],
      }),
    ).toBe(true);
  });
});

describe("summariseCredentials", () => {
  it("ages a recorded rotation", () => {
    const [only] = summariseCredentials(
      [{ name: "T", rotatedOn: "2026-08-10", everyDays: 365 }],
      TODAY,
    );
    expect(only.age).toBe(30);
    expect(only.state).toBe("current");
  });

  it("calls it overdue past its own interval", () => {
    const [only] = summariseCredentials(
      [{ name: "T", rotatedOn: "2025-01-01", everyDays: 365 }],
      TODAY,
    );
    expect(only.state).toBe("overdue");
  });

  /*
   * A missing date is reported and never raises the alarm. A weekly notice
   * about a form nobody has filled in is how somebody learns to skip the
   * notice that matters; an overdue rotation is a fact about the world and
   * does raise it.
   */
  it("reports a missing date without opening an issue for it", () => {
    const clear = {
      audit: { reportable: [], production: [], total: 0 },
      outdated: { major: [], minor: [], patch: [] },
      drift: false,
    };
    const unrecorded = summariseCredentials(
      [{ name: "T", rotatedOn: null, everyDays: 365 }],
      TODAY,
    );
    expect(unrecorded[0].state).toBe("unrecorded");
    expect(needsAttention({ ...clear, credentials: unrecorded })).toBe(false);

    const overdue = summariseCredentials(
      [{ name: "T", rotatedOn: "2020-01-01", everyDays: 365 }],
      TODAY,
    );
    expect(needsAttention({ ...clear, credentials: overdue })).toBe(true);
  });
});

/*
 * The two corrections to what npm reports. npm knows what is published and
 * what is installed; it does not know what we run or what we import, and on
 * both counts it told this report something false.
 */
describe("packages held to a track", () => {
  // The real shape: @types/node on ^22, with 26 published.
  const outdated = {
    "@types/node": { current: "22.20.4", wanted: "22.20.4", latest: "26.6.2" },
    eslint: { current: "9.39.5", wanted: "9.39.5", latest: "10.11.0" },
  };
  const pinned = [{ package: "@types/node", track: "22" }];

  it("says nothing about a pinned package at the top of its track", () => {
    const summary = summariseOutdated(outdated, pinned);
    expect(summary.major.map((r: { name: string }) => r.name)).toEqual([
      "eslint",
    ]);
    expect(summary.pinned).toEqual([]);
  });

  it("still reports one that has fallen behind inside its track", () => {
    // Muting the package would hide this; measuring against the track does not.
    const behind = {
      "@types/node": {
        current: "22.1.0",
        wanted: "22.20.4",
        latest: "26.6.2",
      },
    };
    const summary = summariseOutdated(behind, pinned);
    expect(summary.minor).toHaveLength(1);
    expect(summary.minor[0].latest).toBe("22.20.4");
    expect(summary.minor[0].pinnedTo).toBe("22");
    expect(summary.minor[0].published).toBe("26.6.2");
  });

  it("reports the whole jump when nothing is pinned", () => {
    // Without the pin this is the wrong advice the check used to give.
    const summary = summariseOutdated(outdated);
    expect(summary.major.map((r: { name: string }) => r.name)).toEqual([
      "@types/node",
      "eslint",
    ]);
  });

  it("names the track on the line that raises it", () => {
    const body = buildReport({
      audit: { reportable: [], production: [], demoted: [], total: 0 },
      outdated: summariseOutdated(
        { "@types/node": { current: "22.1.0", wanted: "22.20.4" } },
        pinned,
      ),
      drift: false,
      versions: {},
      date: "2026-09-19",
    });
    expect(body).toContain("held to 22.x");
  });
});

describe("advisories npm calls production and a person checked", () => {
  const audit = {
    vulnerabilities: {
      next: advisory({ severity: "critical", isDirect: true }),
      prisma: advisory({ severity: "high", isDirect: true }),
    },
  };
  // npm's --omit=dev tree keeps optional peers, so the CLI lands here too.
  const prodAudit = {
    vulnerabilities: { next: advisory(), prisma: advisory() },
  };
  const unreachable = [
    { package: "prisma", checkedOn: "2026-09-19", why: "The CLI." },
  ];

  it("stops counting one that nothing imports", () => {
    const summary = summariseAudit(audit, prodAudit, unreachable);
    expect(summary.production.map((a: { name: string }) => a.name)).toEqual([
      "next",
    ]);
    expect(summary.demoted.map((a: { name: string }) => a.name)).toEqual([
      "prisma",
    ]);
  });

  it("still reports it, rather than hiding it", () => {
    // A silent exception is how a real finding gets suppressed for a year.
    const summary = summariseAudit(audit, prodAudit, unreachable);
    expect(summary.reportable).toHaveLength(2);
    expect(summary.total).toBe(2);
  });

  it("does not demote a package nobody wrote down", () => {
    const summary = summariseAudit(audit, prodAudit, []);
    expect(summary.production).toHaveLength(2);
    expect(summary.demoted).toEqual([]);
  });

  it("says once, under the list, which lines were corrected", () => {
    const body = buildReport({
      audit: summariseAudit(audit, prodAudit, unreachable),
      outdated: { major: [], minor: [], patch: [] },
      drift: false,
      versions: {},
      date: "2026-09-19",
    });
    expect(body).toContain("2 at moderate or above, 1 of those reachable");
    expect(body).toContain("checked by hand");
    expect(body).toContain("`lifecycle.json`");
  });
});
