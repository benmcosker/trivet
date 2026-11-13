import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { DeleteAccount, HiddenHouseholds } from "@/components/AccountSettings";
import { AppShell } from "@/components/AppShell";
import { ConnectedAssistants } from "@/components/ConnectedAssistants";
import { HouseholdManager } from "@/components/HouseholdManager";
import { deletionPreview } from "@/lib/account-deletion";
import { getHousehold, MAX_HOUSEHOLD_NAME } from "@/lib/household";
import { INVITE_TTL_DAYS, inviteLink, listPendingInvites } from "@/lib/invites";
import { listConnectedAssistants } from "@/lib/mcp/access";
import { MCP_SCOPES } from "@/lib/mcp/resource";
import { listHiddenHouseholds } from "@/lib/moderation";
import { requireHousehold } from "@/lib/session";
import { smsAvailable } from "@/lib/sms";

export default async function HouseholdPage() {
  const user = await requireHousehold();

  const [household, invites, hidden, preview, assistants] = await Promise.all([
    getHousehold(user.householdId),
    listPendingInvites(user.id),
    listHiddenHouseholds(user.householdId),
    deletionPreview(user.id),
    listConnectedAssistants(user.id),
  ]);

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Your household
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Everyone here shares one library, one weekly plan and one shopping list.
      </Typography>

      <HouseholdManager
        householdName={household?.name ?? user.householdName}
        defaultServings={household?.defaultServings ?? null}
        members={
          household?.members.map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            phone: member.phone,
            smsConsented: member.smsConsented,
          })) ?? []
        }
        invites={invites.map((invite) => ({
          id: invite.id,
          code: invite.code,
          link: inviteLink(invite.code),
          email: invite.email,
          expiresAt: invite.expiresAt.toISOString(),
          joinsFamily: invite.joinsFamily,
        }))}
        inviteDays={INVITE_TTL_DAYS}
        maxNameLength={MAX_HOUSEHOLD_NAME}
        myPhone={
          household?.members.find((m) => m.id === user.id)?.phone ?? null
        }
        myConsent={
          household?.members.find((m) => m.id === user.id)?.smsConsented ??
          false
        }
        smsConfigured={smsAvailable()}
      />

      <Stack spacing={3} sx={{ mt: 3 }}>
        <ConnectedAssistants
          assistants={assistants.map((assistant) => ({
            clientId: assistant.clientId,
            name: assistant.name,
            connected: dayName(assistant.connectedAt),
            lastActive: dayName(assistant.lastActiveAt),
            canPlan: assistant.scopes.includes(MCP_SCOPES.write),
          }))}
        />
        <HiddenHouseholds households={hidden} />
        <DeleteAccount
          email={user.email}
          householdName={household?.name ?? user.householdName}
          preview={preview}
        />
      </Stack>
    </AppShell>
  );
}

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

/** "today", or "12 November". */
function dayName(date: Date, now = new Date()): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  if (day(date) === day(now)) return "today";
  const words = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return date.getUTCFullYear() === now.getUTCFullYear()
    ? words
    : `${words} ${date.getUTCFullYear()}`;
}
