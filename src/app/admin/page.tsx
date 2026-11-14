import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";

import { AdminReports } from "@/components/AdminReports";
import { AppShell } from "@/components/AppShell";
import {
  adminEmails,
  adminOverview,
  isAdmin,
  maskAddress,
  type AdminHousehold,
} from "@/lib/admin";
import { listOpenReports } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

/** "2026-09-06", or a word when there is no date. */
function day(value: Date | null, absent: string): string {
  return value ? value.toISOString().slice(0, 10) : absent;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  );
}

function HouseholdCard({ household }: { household: AdminHousehold }) {
  const { recipes, planner } = household;
  const sources = [
    recipes.manual ? `${recipes.manual} typed` : null,
    recipes.pdf ? `${recipes.pdf} PDF` : null,
    recipes.photo ? `${recipes.photo} photo` : null,
  ].filter(Boolean);

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h3">{household.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          Joined {day(household.createdAt, "unknown")}
        </Typography>

        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 3, mt: 2 }}>
          <Stat
            label="Recipes"
            value={
              recipes.total === 0
                ? "None yet"
                : `${recipes.total}${sources.length ? ` (${sources.join(", ")})` : ""}`
            }
          />
          <Stat
            label="Planner"
            value={
              planner.mealsPlanned === 0
                ? "Never used"
                : `${planner.mealsPlanned} ${planner.mealsPlanned === 1 ? "meal" : "meals"}, last ${day(planner.lastPlannedAt, "unknown")}`
            }
          />
          <Stat
            label="Card reads"
            value={
              household.uploadAttempts === 0
                ? "None"
                : `${household.uploadAttempts} ${household.uploadAttempts === 1 ? "attempt" : "attempts"}`
            }
          />
          {/*
           * "Sent", never "delivered". The app watched itself ask Twilio and
           * nothing more, so the label has to stop where the knowledge does.
           */}
          <Stat
            label="Lists texted"
            value={
              household.texts.sent === 0
                ? "Never"
                : `${household.texts.sent} sent, last ${day(household.texts.lastSentAt, "unknown")}`
            }
          />
        </Stack>

        <Stack spacing={1} sx={{ mt: 2.5 }}>
          {household.members.map((member) => (
            <Box
              key={member.email}
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: 1,
                borderTop: 1,
                borderColor: "divider",
                pt: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {member.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flexGrow: 1 }}
              >
                {member.email}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {member.agreedToTexts ? "texts on" : "texts off"} &middot; seen{" "}
                {day(member.lastSignInAt, "not lately")}
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Who is using the app, at the meta level.
 *
 * Counts and dates only. No recipe titles, no plans, no shopping lists - the
 * privacy policy tells people their recipes and plans are visible to the
 * members of their household, and this page has to leave that true.
 *
 * Answers 404 rather than 403 to everybody else. A 403 tells a stranger the
 * page exists and that somebody has the key; a 404 says only what a wrong URL
 * says.
 */
export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) {
    /*
     * A 404 is the right answer and a terrible symptom: it looks identical
     * whether the variable never reached the runtime or simply does not list
     * this address. The count separates those two in the server log without
     * putting anybody's address in it - "0 configured" is a deploy problem,
     * "1 configured" is a mismatch between the value and the account.
     */
    const configured = adminEmails();
    console.warn(
      `[admin] refused: signed in as ${maskAddress(user.email.trim().toLowerCase())}; ` +
        `${configured.length} configured: ` +
        (configured.map(maskAddress).join(", ") || "(none)"),
    );
    notFound();
  }

  const [households, reports] = await Promise.all([
    adminOverview(),
    listOpenReports(),
  ]);
  const people = households.reduce((n, h) => n + h.members.length, 0);

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Activity
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {households.length}{" "}
        {households.length === 1 ? "household" : "households"}, {people}{" "}
        {people === 1 ? "person" : "people"}. Counts and dates only - nothing
        anybody cooked, planned or shopped for.
      </Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        <Link href="/admin/assistants">Assistant requests</Link>: what AI
        assistants asked Trivet, kept 14 days.
      </Typography>

      <AdminReports reports={reports} />

      {households.length === 0 ? (
        <Typography color="text.secondary">No households yet.</Typography>
      ) : (
        <Stack spacing={2}>
          {households.map((household) => (
            <HouseholdCard key={household.id} household={household} />
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
