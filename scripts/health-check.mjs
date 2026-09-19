/**
 * The workflow's entry point: read what the tools produced, write the report.
 *
 * Split from health-report.mjs so the judgement calls in there can be tested
 * without a filesystem, and so this file stays a matter of plumbing.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  buildReport,
  needsAttention,
  summariseAudit,
  summariseCredentials,
  summariseOutdated,
  summariseRuntimes,
} from "./health-report.mjs";

/** npm writes nothing when it has nothing to say, and that is not an error. */
function readJson(path) {
  try {
    const text = readFileSync(path, "utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

/**
 * Support dates, asked for rather than remembered.
 *
 * A date copied into the repo is wrong the first time upstream moves it and
 * nobody re-reads a constant. A lookup that fails returns nothing for that
 * runtime, which the report says out loud - "could not check" and "fine" are
 * different answers and only one of them deserves silence.
 */
async function fetchEol(runtimes) {
  const found = {};
  for (const r of runtimes) {
    const key = `${r.product}/${r.cycle}`;
    try {
      const res = await fetch(`https://endoflife.date/api/${key}.json`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) found[key] = await res.json();
      else console.error(`[health] ${key}: HTTP ${res.status}`);
    } catch (error) {
      console.error(`[health] ${key}: ${error.message}`);
    }
  }
  return found;
}

const lifecycle = readJson(
  new URL("../lifecycle.json", import.meta.url).pathname,
);
const today = new Date();

const runtimes = summariseRuntimes(
  lifecycle.runtimes ?? [],
  await fetchEol(lifecycle.runtimes ?? []),
  today,
  lifecycle.warnWithinDays ?? 180,
);
const credentials = summariseCredentials(lifecycle.credentials ?? [], today);

const audit = summariseAudit(
  readJson("/tmp/audit.json"),
  readJson("/tmp/audit-prod.json"),
  lifecycle.unreachable ?? [],
);
const outdated = summariseOutdated(
  readJson("/tmp/outdated.json"),
  lifecycle.pinned ?? [],
);
const drift = process.env.DRIFT === "true";

const report = {
  audit,
  outdated,
  drift,
  runtimes,
  credentials,
  versions: {
    node: process.version,
    next: pkg.dependencies?.next ?? "unknown",
    prisma:
      pkg.devDependencies?.prisma ?? pkg.dependencies?.prisma ?? "unknown",
  },
  date: new Date().toISOString().slice(0, 10),
};

const needed = needsAttention(report);
const body = buildReport(report);

// Multi-line values need a delimiter GitHub will not find in the content.
const out = process.env.GITHUB_OUTPUT;
if (out) {
  const eof = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(out, `needed=${needed}\n`);
  appendFileSync(out, `body<<${eof}\n${body}\n${eof}\n`);
}

console.log(needed ? body : "Nothing to report.");
