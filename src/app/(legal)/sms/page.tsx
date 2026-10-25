import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { SmsConsentCheckbox, SmsDisclosure } from "@/components/SmsDisclosure";
import { BRAND, CONTACT_EMAIL, LEGAL_UPDATED, SMS_PURPOSE } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Text messages — ${BRAND}`,
  description: `How members of ${BRAND} opt in to receive text messages.`,
};

/**
 * How somebody comes to receive a text from this app.
 *
 * This is the page whose URL goes in the campaign's Message Flow field. The
 * opt-in itself lives behind a login, and the usual advice is to screenshot it
 * onto a file-sharing service - but a live page a reviewer can open is both
 * easier for them and impossible to let go stale.
 *
 * The box and the disclosures below are the real components from the real
 * form, rendered inert. Retyping them here as a description would let the
 * description drift from what people are actually shown, which is the specific
 * thing the review exists to catch.
 */
export default function SmsPolicyPage() {
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Text messages
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {BRAND} is a private, invite-only app one family uses to plan meals and
        shop for them. The only text it sends is {SMS_PURPOSE}.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        How people opt in
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Members join by invitation and sign in with an email address and
        password. Giving a phone number is optional, and an account works fully
        without one.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A member who wants the shopping list by text enters their own number -
        their own only, never anybody else&apos;s - either when they create
        their account or afterwards on the Household page. Beside the field is
        an unticked checkbox. Nobody is sent anything until that box is ticked:
        a number on file with the box unticked is stored and never used.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        The date of the agreement is recorded against the account. Unticking the
        box, clearing the number, or replying STOP all stop the messages.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        What the opt-in looks like
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Exactly as it appears on the Household page, shown here without the
        controls being live.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            Your phone
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Used to text you the week&apos;s shopping list. Clear it to stop.
          </Typography>
          <TextField
            label="Phone"
            type="tel"
            placeholder="(555) 123-4567"
            fullWidth
            size="small"
            disabled
          />
          <Box sx={{ mt: 2 }}>
            {/* Unticked, as it is for every new member. */}
            <SmsConsentCheckbox checked={false} disabled />
            <Box sx={{ mt: 1 }}>
              <SmsDisclosure />
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Getting help
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Reply HELP to any message, or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Reply STOP to
        stop receiving messages at any time.
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Last updated {LEGAL_UPDATED}.
      </Typography>
    </>
  );
}
