import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { isAdmin } from "@/lib/admin";
import {
  recentMcpRequests,
  requestLogEnabled,
  RETENTION_DAYS,
} from "@/lib/mcp/request-log";
import {
  groupVisits,
  isHandshake,
  summarize,
  type Line,
  type Visit,
} from "@/lib/mcp/request-log-view";
import { requireUser } from "@/lib/session";
import { fonts } from "@/theme/theme";

/**
 * What assistants have asked Trivet: admin only, temporary
 * (`request-log.ts`). Drawn on https://claude.ai/artifact/Bkrx4QPg1WjvdnAU9SRKpG:
 * visits (B) under the summary strip (C), stacking on a phone.
 *
 * Its own page rather than a section of Activity, which promises counts and
 * dates only; this shows what people searched for. `?problems=1` shows only
 * visits with a refusal or error; `?all=1` adds connection handshakes.
 */

const label = {
  fontFamily: fonts.sans,
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "text.muted",
} as const;

function Flag({ children }: { children: string }) {
  return (
    <Box
      component="span"
      sx={{ ...label, color: "secondary.main", ml: 0.75, whiteSpace: "nowrap" }}
    >
      {children}
    </Box>
  );
}

function Sentence({ line, time }: { line: Line; time: string }) {
  return (
    <Box component="li" sx={{ display: "flex", gap: { xs: 1.25, sm: 1.75 } }}>
      <Typography
        component="span"
        sx={{
          flex: { xs: "0 0 42px", sm: "0 0 64px" },
          fontFamily: fonts.sans,
          fontSize: 13,
          color: "text.muted",
          pt: "3px",
        }}
      >
        {time}
      </Typography>
      <Typography component="span" sx={{ lineHeight: 1.45 }}>
        {line.words.map((word, index) =>
          word.strong ? (
            <Box component="strong" key={index} sx={{ fontWeight: 500 }}>
              {word.text}
            </Box>
          ) : (
            <span key={index}>{word.text}</span>
          ),
        )}
        {line.note ? (
          <Box
            component="span"
            sx={{ fontFamily: fonts.sans, fontSize: 13, color: "text.muted" }}
          >
            {" "}
            {line.note}
          </Box>
        ) : null}
        {line.flag ? <Flag>{line.flag}</Flag> : null}
      </Typography>
    </Box>
  );
}

/**
 * "Today, 9:00–9:02 AM", "Yesterday, 6:11 PM" or "Nov 12, 8:00 AM", in the
 * admin's time zone. Outside the page so reading the clock happens once,
 * here, rather than in render.
 */
function visitTime(timeZone: string, clock: Intl.DateTimeFormat) {
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone });
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  });
  const now = Date.now();
  const today = dayKey.format(now);
  const yesterday = dayKey.format(now - 86_400_000);
  return (visit: Visit) => {
    const key = dayKey.format(visit.start);
    const day =
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : dayName.format(visit.start);
    const from = clock.format(visit.start);
    const to = clock.format(visit.end);
    return from === to ? `${day}, ${from}` : `${day}, ${from}–${to}`;
  };
}

export default async function AssistantRequestsPage({
  searchParams,
}: PageProps<"/admin/assistants">) {
  const user = await requireUser();
  if (!isAdmin(user.email)) notFound();

  const params = await searchParams;
  const showAll = params.all === "1";
  const onlyProblems = params.problems === "1";

  const rows = (await recentMcpRequests(1000)).filter(
    // Handshakes are noise; a refused one is a knock worth seeing.
    (row) => showAll || !isHandshake(row) || row.outcome !== "ok",
  );
  const allVisits = groupVisits(rows);
  const summary = summarize(rows, allVisits);
  const visits = onlyProblems
    ? allVisits.filter((visit) => visit.problems > 0)
    : allVisits;

  const timeZone = process.env.ADMIN_TIMEZONE?.trim() || "America/New_York";
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const when = visitTime(timeZone, clock);
  const query = (next: Record<string, string | null>) => {
    const search = new URLSearchParams();
    const merged = {
      all: showAll ? "1" : null,
      problems: onlyProblems ? "1" : null,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value);
    }
    const text = search.toString();
    return text ? `/admin/assistants?${text}` : "/admin/assistants";
  };

  return (
    <AppShell>
      <Typography sx={{ fontFamily: fonts.sans, fontSize: 13, mb: 1 }}>
        <Link href="/admin">Activity</Link>{" "}
        <Box component="span" sx={{ color: "text.secondary" }}>
          /
        </Box>
      </Typography>
      <Typography
        variant="h1"
        sx={{ fontSize: { xs: "2.375rem", sm: "4rem" }, lineHeight: 1 }}
      >
        Assistant requests
      </Typography>
      <Typography
        sx={{ mt: 2, maxWidth: 720, fontSize: { sm: "1.1875rem" } }}
        color="text.soft"
      >
        The last {RETENTION_DAYS} days. Each visit is one sitting: the calls one
        person&apos;s assistant made within a few minutes. Never what they
        typed, only what it asked Trivet.
        {requestLogEnabled() ? "" : " Logging is switched off."}
      </Typography>

      {/* The strip: C, two columns on a phone. */}
      <Box
        sx={{
          mt: { xs: 3, sm: 4.5 },
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            md: "repeat(4, minmax(0, 1fr))",
          },
          borderTop: "1px solid",
          borderColor: "text.primary",
          "& > div": {
            py: { xs: 2, sm: 2.75 },
            pr: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          },
          "& > div:nth-of-type(even)": {
            pl: 2,
            borderLeft: 1,
            borderColor: "divider",
          },
          // Set inside the same breakpoint, so the colour isn't lost to
          // the shorthand's currentColor.
          "& > div:nth-of-type(3)": {
            pl: { md: 3 },
            borderLeft: { md: "1px solid" },
            borderLeftColor: { md: "divider" },
          },
        }}
      >
        <div>
          <Box component="span" sx={label}>
            Calls
          </Box>
          <Typography sx={{ fontSize: { xs: 36, sm: 48 }, lineHeight: 1 }}>
            {summary.calls}
          </Typography>
          <Typography variant="body2" color="text.muted">
            over {summary.visits} {summary.visits === 1 ? "visit" : "visits"}
          </Typography>
        </div>
        <div>
          <Box component="span" sx={label}>
            People
          </Box>
          <Typography sx={{ fontSize: { xs: 36, sm: 48 }, lineHeight: 1 }}>
            {summary.people}
          </Typography>
          <Typography variant="body2" color="text.muted">
            in {summary.households}{" "}
            {summary.households === 1 ? "household" : "households"}
          </Typography>
        </div>
        <div>
          <Box component="span" sx={label}>
            By assistant
          </Box>
          {summary.byAssistant.length === 0 ? (
            <Typography color="text.muted">None yet</Typography>
          ) : (
            summary.byAssistant.map((entry) => (
              <Box
                key={entry.name}
                sx={{ display: "flex", justifyContent: "space-between" }}
              >
                <Typography>{entry.name}</Typography>
                <Typography>{entry.calls}</Typography>
              </Box>
            ))
          )}
        </div>
        <div>
          <Box component="span" sx={label}>
            Most searched
          </Box>
          {summary.mostSearched.length === 0 ? (
            <Typography color="text.muted">No searches yet</Typography>
          ) : (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {summary.mostSearched.map((term) => (
                <Box
                  key={term}
                  component="span"
                  sx={{ px: 1.25, py: 0.25, bgcolor: "background.raised" }}
                >
                  {term}
                </Box>
              ))}
            </Box>
          )}
        </div>
      </Box>

      <Typography variant="body2" color="text.muted" sx={{ mt: 2 }}>
        {summary.problems === 0
          ? "No problems."
          : `${summary.problems} ${summary.problems === 1 ? "problem" : "problems"}.`}{" "}
        {onlyProblems ? (
          <Link href={query({ problems: null })}>Show every visit</Link>
        ) : summary.problems > 0 ? (
          <Link href={query({ problems: "1" })}>Show only problems</Link>
        ) : null}
        {" · "}
        <Link href={query({ all: showAll ? null : "1" })}>
          {showAll ? "Hide handshakes" : "Include handshakes"}
        </Link>
      </Typography>

      {/* The visits: B. */}
      {visits.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 4 }}>
          Nothing yet.
        </Typography>
      ) : (
        <Box
          sx={{
            mt: { xs: 3, sm: 5 },
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
            },
            gap: { xs: 2, sm: 3.5 },
            alignItems: "start",
          }}
        >
          {visits.map((visit) => (
            <Box
              component="article"
              key={visit.key}
              sx={{
                border: "1px solid",
                borderColor: visit.person ? "divider" : "dividerDashed",
                borderStyle: visit.person ? "solid" : "dashed",
                p: { xs: 2.25, sm: 3.25 },
                display: "flex",
                flexDirection: "column",
                gap: 1.75,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  columnGap: 2,
                  rowGap: 0.5,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: "text.muted",
                }}
              >
                <span>
                  <Box
                    component="strong"
                    sx={{ color: "text.primary", fontWeight: 700 }}
                  >
                    {visit.person ?? "Not signed in"}
                  </Box>
                  {visit.person ? ` · via ${visit.assistant}` : ""}
                </span>
                <span>
                  {when(visit)} · {visit.lines.length}{" "}
                  {visit.lines.length === 1 ? "call" : "calls"}
                  {visit.problems > 0 ? (
                    <Box
                      component="span"
                      sx={{ color: "secondary.main", fontWeight: 700 }}
                    >
                      {" "}
                      · {visit.problems}{" "}
                      {visit.problems === 1 ? "problem" : "problems"}
                    </Box>
                  ) : null}
                </span>
              </Box>
              <Typography
                component="h2"
                sx={{
                  fontSize: { xs: "1.4375rem", sm: "1.75rem" },
                  lineHeight: 1.2,
                  color: visit.person ? "text.primary" : "text.muted",
                }}
              >
                {visit.headline}
              </Typography>
              {visit.person ? (
                <Box
                  component="ol"
                  sx={{
                    m: 0,
                    p: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  {visit.lines.map((line) => (
                    <Sentence
                      key={line.id}
                      line={line}
                      time={short.format(line.at)}
                    />
                  ))}
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
    </AppShell>
  );
}
