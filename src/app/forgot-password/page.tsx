import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { emailAvailable } from "@/lib/email";
import { CONTACT_EMAIL } from "@/lib/legal";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Forgotten password" };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/recipes");

  /*
   * Said plainly when there is no way to send.
   *
   * The alternative - showing the form anyway - would take the address,
   * answer "check your email", and send nothing, because the endpoint cannot
   * distinguish "no such account" from "no mail provider" without telling
   * strangers which addresses exist. Somebody locked out would wait on a mail
   * that was never going to arrive. Better to be useless out loud, the same
   * way the texting button is simply absent when Twilio is not configured.
   */
  if (!emailAvailable()) {
    return (
      <AppShell>
        <Box sx={{ maxWidth: 420, mx: "auto", mt: 6 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h2">No way to send that</Typography>
                <Typography variant="body1" color="text.muted">
                  This deployment has no email provider configured, so a reset
                  link cannot be sent. Ask whoever runs it to reset your
                  password for you.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  That is {CONTACT_EMAIL}.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ForgotPasswordForm />
    </AppShell>
  );
}
