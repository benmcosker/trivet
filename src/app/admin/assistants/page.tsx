import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { isAdmin } from "@/lib/admin";
import {
  recentMcpRequests,
  requestLogEnabled,
  RETENTION_DAYS,
} from "@/lib/mcp/request-log";
import { requireUser } from "@/lib/session";
import { fonts } from "@/theme/theme";

/**
 * What assistants have asked Trivet, newest first: admin only, temporary
 * (`request-log.ts`). Its own page rather than a section of Activity, which
 * promises counts and dates only; this shows what people searched for.
 *
 * Tool calls and refusals by default; `?all=1` adds the handshakes
 * (initialize, tools/list) every connection makes.
 */
export default async function AssistantRequestsPage({
  searchParams,
}: PageProps<"/admin/assistants">) {
  const user = await requireUser();
  if (!isAdmin(user.email)) notFound();

  const { all } = await searchParams;
  const showAll = all === "1";
  const rows = (await recentMcpRequests()).filter(
    (row) => showAll || row.method === "tools/call" || row.outcome !== "ok",
  );

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.ADMIN_TIMEZONE?.trim() || "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Assistant requests
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        What assistants asked Trivet over the last {RETENTION_DAYS} days, newest
        first. Never what the person typed to the assistant: only the calls it
        chose to make.
      </Typography>
      <Typography variant="body2" color="text.muted" sx={{ mb: 3 }}>
        {requestLogEnabled()
          ? "Logging is on."
          : "Logging is off (MCP_REQUEST_LOG=off); older entries shown."}{" "}
        <Link href={showAll ? "/admin/assistants" : "/admin/assistants?all=1"}>
          {showAll ? "Tool calls only" : "Include handshakes"}
        </Link>
        {" · "}
        <Link href="/admin">Activity</Link>
      </Typography>

      {rows.length === 0 ? (
        <Typography color="text.secondary">Nothing yet.</Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {rows.map((row) => (
            <Box key={row.id} sx={{ py: 1.5 }}>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  columnGap: 1.5,
                  alignItems: "baseline",
                }}
              >
                <Typography sx={{ fontWeight: 600 }}>
                  {row.tool ?? row.method}
                </Typography>
                {row.outcome !== "ok" ? (
                  <Typography
                    variant="overline"
                    component="span"
                    color="secondary"
                  >
                    {row.outcome} {row.status}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.muted">
                  {when.format(row.createdAt)} · {row.durationMs} ms
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {row.user
                  ? `${row.user.name}${row.user.household ? `, ${row.user.household.name}` : ""}`
                  : "Not signed in"}
                {row.assistant ? ` · via ${row.assistant}` : ""}
              </Typography>
              {row.arguments && row.arguments !== "{}" ? (
                <Typography
                  component="pre"
                  sx={{
                    m: 0,
                    mt: 0.5,
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {row.arguments}
                </Typography>
              ) : null}
              {row.detail ? (
                <Typography
                  variant="body2"
                  color="text.muted"
                  sx={{ mt: 0.5, fontFamily: fonts.sans }}
                >
                  {row.detail}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
