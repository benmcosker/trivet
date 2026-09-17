"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { requestPasswordReset } from "@/lib/auth-client";

/**
 * Asking for a reset link.
 *
 * The answer is the same whether or not the address has an account, and that
 * is the whole design of the page rather than a detail of it. Better Auth goes
 * to the trouble of faking the database lookup for an unknown address so the
 * timing does not give it away either; saying "no account with that email"
 * here would hand back the account-enumeration oracle it just closed. For an
 * invite-only app the membership list is exactly the thing worth not
 * publishing.
 *
 * So: one message, always, and it is careful not to promise that a mail is on
 * its way to this particular address.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await requestPasswordReset({
      email,
      // Where the link lands once the token has been checked. Better Auth
      // appends ?token=, and /reset-password reads it from there.
      redirectTo: "/reset-password",
    });

    setBusy(false);

    // Only a transport-level failure reaches here - a refused address answers
    // 200 by design. Worth showing rather than swallowing: it means the
    // request never arrived, so waiting for a mail would be waiting forever.
    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }

    setSent(true);
  }

  return (
    <Box sx={{ maxWidth: 420, mx: "auto", mt: 6 }}>
      <Card>
        <CardContent>
          {sent ? (
            <Stack spacing={2}>
              <Typography variant="h2">Check your email</Typography>
              <Typography variant="body1" color="text.muted">
                If there is an account for {email.trim() || "that address"}, a
                link to choose a new password is on its way. It works once, and
                stops working after an hour.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Nothing arrived? It may be in spam, or the address may not have
                an account here. <Link href="/sign-in">Back to sign in</Link>
              </Typography>
            </Stack>
          ) : (
            <Stack component="form" onSubmit={handleSubmit} spacing={2.5}>
              <Box>
                <Typography variant="h2">Forgotten password</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Give us the address you signed up with and we will send a link
                  to choose a new password.
                </Typography>
              </Box>

              {error ? <Alert severity="error">{error}</Alert> : null}

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy}
              >
                {busy ? "Working…" : "Send the link"}
              </Button>

              <Typography variant="body2" color="text.secondary" align="center">
                Remembered it? <Link href="/sign-in">Sign in</Link>
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
