"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useState, useTransition, type FormEvent } from "react";

import {
  createInviteAction,
  renameHouseholdAction,
  setDefaultServingsAction,
  revokeInviteAction,
  saveMyPhoneAction,
  type CreatedInvite,
  type InviteKind,
} from "@/app/household/actions";
import { formatPhone } from "@/lib/phone";
import { MAX_SERVINGS } from "@/lib/scale";

import { SmsConsentCheckbox, SmsDisclosure } from "./SmsDisclosure";

export type MemberView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  smsConsented: boolean;
};
export type InviteView = {
  id: string;
  code: string;
  email: string | null;
  expiresAt: string;
  joinsFamily: boolean;
};

/**
 * What each kind of invitation actually does, in the words someone deciding
 * between them needs.
 *
 * Spelled out on the page rather than left to the label, because the two are
 * not variations on a theme: one hands over the whole library and this week's
 * plan, and the other hands over nothing at all. Getting it wrong in the
 * generous direction cannot be undone by deleting a code.
 */
const KIND_COPY: Record<InviteKind, { label: string; detail: string }> = {
  family: {
    label: "To the family",
    detail:
      "They join this household - the same weekly plan, the same pantry and the same shopping list, and they can change all of it.",
  },
  outside: {
    label: "Outside the family",
    detail:
      "They start a household of their own, with its own plan and shopping list. The recipe library is shared either way: everyone signed in reads and rates the same recipes.",
  },
};

export function HouseholdManager({
  householdName,
  defaultServings,
  members,
  invites,
  inviteDays,
  maxNameLength,
  myPhone,
  myConsent,
  smsConfigured,
}: {
  householdName: string;
  /** How many this household cooks for, or null when nobody has said. */
  defaultServings: number | null;
  members: MemberView[];
  invites: InviteView[];
  inviteDays: number;
  maxNameLength: number;
  myPhone: string | null;
  myConsent: boolean;
  smsConfigured: boolean;
}) {
  return (
    <Stack spacing={3}>
      <HouseholdName
        current={householdName}
        maxLength={maxNameLength}
        defaultServings={defaultServings}
      />
      <MyPhone
        current={myPhone}
        consented={myConsent}
        smsConfigured={smsConfigured}
      />
      <Members members={members} householdName={householdName} />
      <InviteForm inviteDays={inviteDays} maxNameLength={maxNameLength} />
      {invites.length > 0 ? <PendingInvites invites={invites} /> : null}
    </Stack>
  );
}

function HouseholdName({
  current,
  maxLength,
  defaultServings,
}: {
  current: string;
  maxLength: number;
  /** How many this household cooks for, or null when nobody has said. */
  defaultServings: number | null;
}) {
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = draft.trim() !== current;

  function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameHouseholdAction(draft);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardContent component="form" onSubmit={save}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Household
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            label="Name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            slotProps={{ htmlInput: { maxLength } }}
            fullWidth
            size="small"
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={!changed || pending}
            sx={{ flexShrink: 0 }}
          >
            Save
          </Button>
        </Stack>
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </CardContent>

      {/*
       * Outside the name's form, and saving on its own.
       *
       * Two fields under one Save would mean choosing a number and walking
       * away without it taking, which is how a household ends up planning
       * for four while the page says six. It is also not part of the same
       * question: one is what you are called and the other is how many of
       * you there are.
       */}
      <CardContent sx={{ pt: 0 }}>
        <ServingDefault current={defaultServings} />
      </CardContent>
    </Card>
  );
}

/**
 * How many this household cooks for.
 *
 * What it changes is the next dinner planned, not the week already on the
 * planner: a plan somebody made on purpose is not rewritten from a settings
 * page, and the planner has its own per-evening control for the Saturday
 * when four become eight.
 *
 * It only ever raises a dish. A recipe for eight planned by a household of
 * two is still a recipe for eight - this app does not scale down - so the
 * number is a floor under the week rather than a target for it.
 */
function ServingDefault({ current }: { current: number | null }) {
  const [pending, startTransition] = useTransition();

  const choices = Array.from({ length: MAX_SERVINGS }, (_, i) => i + 1);

  return (
    <Stack spacing={1}>
      <TextField
        select
        size="small"
        label="Usually cooking for"
        value={current == null ? "" : String(current)}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value;
          startTransition(async () => {
            await setDefaultServingsAction(value === "" ? null : Number(value));
          });
        }}
        sx={{ maxWidth: { sm: 260 } }}
      >
        {/*
         * A real answer rather than a blank: it puts the app back to planning
         * each dish for whatever it makes, which is what it did before anyone
         * was asked.
         */}
        <MenuItem value="">Whatever the recipe makes</MenuItem>
        {choices.map((choice) => (
          <MenuItem key={choice} value={String(choice)}>
            {choice}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="caption" color="text.secondary">
        New dinners are planned for this. It never cooks a recipe for fewer
        people than it was written for, and this week&rsquo;s plan keeps the
        numbers it already has.
      </Typography>
    </Stack>
  );
}

/**
 * Your own number, and only ever your own.
 *
 * A phone number is the one field here that reaches somebody outside the app,
 * so nobody gets to type it on another person's behalf: a digit wrong sends
 * the week's shopping to a stranger who never asked for it.
 */
function MyPhone({
  current,
  consented,
  smsConfigured,
}: {
  current: string | null;
  consented: boolean;
  smsConfigured: boolean;
}) {
  const [draft, setDraft] = useState(current ? formatPhone(current) : "");
  // Seeded from what is stored rather than from whether a number exists: the
  // two really are separate, and somebody who unticked the box last week
  // should not find it ticked again today.
  const [consent, setConsent] = useState(consented);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);

    startTransition(async () => {
      const result = await saveMyPhoneAction(draft, consent);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(result.phone ? formatPhone(result.phone) : "");
      setConsent(result.consented);
      setSaved(
        !result.phone
          ? "Removed."
          : result.consented
            ? "Saved. You will get the week's list by text."
            : "Saved. You will not be texted until you tick the box.",
      );
    });
  }

  return (
    <Card>
      <CardContent component="form" onSubmit={save}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Your phone
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {smsConfigured
            ? "Used to text you the week's shopping list. Clear it to stop."
            : "Texting is not set up on this deployment yet, so a number here does nothing for now."}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            label="Phone"
            type="tel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            fullWidth
            size="small"
          />
          <Button type="submit" variant="outlined" disabled={pending}>
            Save
          </Button>
        </Stack>

        {/*
         * The agreement, and everything a carrier requires be shown next to it.
         * Kept under the field rather than behind a link: consent given without
         * the frequency and the cost in front of you is not really given.
         */}
        <Box sx={{ mt: 2 }}>
          <SmsConsentCheckbox
            checked={consent}
            onChange={setConsent}
            disabled={pending}
          />
          <Box sx={{ mt: 1 }}>
            <SmsDisclosure />
          </Box>
        </Box>

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {saved}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Members({
  members,
  householdName,
}: {
  members: MemberView[];
  householdName: string;
}) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Who is in {householdName}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {members.length === 1
            ? "Just you, for now."
            : `${members.length} people share this library and plan.`}
        </Typography>

        <Stack divider={<Divider />}>
          {members.map((member) => (
            <Box key={member.id} sx={{ py: 1.25 }}>
              <Typography>{member.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {member.email}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {/*
                 * Three states, not two. Somebody with a number who never
                 * ticked the box gets nothing, and showing their number bare -
                 * exactly as it looks for a member who does get the text -
                 * would say the opposite.
                 */}
                {!member.phone
                  ? "No number — will not get the shopping text"
                  : member.smsConsented
                    ? formatPhone(member.phone)
                    : `${formatPhone(member.phone)} — has not agreed to be texted`}
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function InviteForm({
  inviteDays,
  maxNameLength,
}: {
  inviteDays: number;
  maxNameLength: number;
}) {
  const [kind, setKind] = useState<InviteKind>("family");
  const [email, setEmail] = useState("");
  const [newHousehold, setNewHousehold] = useState("");
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreated(null);

    startTransition(async () => {
      const result = await createInviteAction(kind, email, newHousehold);
      if (result.ok) {
        setCreated(result.invite);
        setEmail("");
        setNewHousehold("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardContent component="form" onSubmit={send}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Invite someone
        </Typography>

        <ToggleButtonGroup
          exclusive
          value={kind}
          onChange={(_, next: InviteKind | null) => next && setKind(next)}
          size="small"
          sx={{ mb: 1.5 }}
        >
          {(Object.keys(KIND_COPY) as InviteKind[]).map((value) => (
            <ToggleButton key={value} value={value}>
              {KIND_COPY[value].label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {KIND_COPY[kind].detail}
        </Typography>

        <Stack spacing={1.5}>
          {kind === "outside" ? (
            <TextField
              label="Name their household (optional)"
              placeholder="The Smiths"
              value={newHousehold}
              onChange={(e) => setNewHousehold(e.target.value)}
              slotProps={{ htmlInput: { maxLength: maxNameLength } }}
              helperText="What their family will be called. Left blank, it takes their own name."
              fullWidth
              size="small"
            />
          ) : null}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Their email (optional)"
              placeholder="Pins the code to one address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              fullWidth
              size="small"
            />
            {/*
             * A button beside a fullWidth TextField gets squeezed below its
             * own text and wraps - which is what made this one two lines tall.
             * Refusing to shrink fixes the cause; shrinking the line height
             * instead left it two lines on a desktop and a 28px tap target on
             * a phone, where it did not wrap at all.
             */}
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ flexShrink: 0 }}
            >
              Create code
            </Button>
          </Stack>
        </Stack>

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}

        {created ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {created.kind === "family"
                ? "This code joins your household."
                : created.householdName
                  ? `This code starts ${created.householdName}.`
                  : "This code starts a household of their own."}{" "}
              It works once, and expires in {inviteDays} days.
            </Typography>
            <Typography
              sx={{
                fontFamily: "monospace",
                fontSize: "1.25rem",
                letterSpacing: 1,
              }}
            >
              {created.code}
            </Typography>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PendingInvites({ invites }: { invites: InviteView[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Codes waiting to be used
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Each works once. Withdraw one if it went to the wrong person.
        </Typography>

        <Stack divider={<Divider />}>
          {invites.map((invite) => (
            <Stack
              key={invite.id}
              direction="row"
              sx={{ py: 1.25, alignItems: "center", gap: 1.5 }}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography sx={{ fontFamily: "monospace" }}>
                  {invite.code}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {invite.email ?? "Anyone with the code"}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={invite.joinsFamily ? "Family" : "Outside"}
                color={invite.joinsFamily ? "primary" : "default"}
                variant={invite.joinsFamily ? "filled" : "outlined"}
              />
              <Button
                size="small"
                color="inherit"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await revokeInviteAction(invite.id);
                  })
                }
              >
                Withdraw
              </Button>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
