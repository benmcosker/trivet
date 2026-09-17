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
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { resetPassword } from "@/lib/auth-client";

/** The same floor sign-up is held to, restated so the field can say it. */
const MIN_PASSWORD_LENGTH = 10;

/**
 * Choosing the new password.
 *
 * The token arrives in the query string, put there by Better Auth's
 * `/reset-password/:token` redirect after it has checked the token is real and
 * unexpired. It is checked again on submit - this page cannot be trusted to
 * have arrived honestly - so the absence of a token here is only a reason to
 * stop before asking someone to type a password that has nowhere to go.
 *
 * Both the token being missing and the token being stale end in the same
 * place: ask for a new link. They are told apart because "this page is wrong"
 * and "you took too long" are different things to have done.
 */
export function ResetPasswordForm({
  token,
  rejected = false,
}: {
  token: string | null;
  /** The token was checked and refused, rather than never arriving. */
  rejected?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Checked here and nowhere else: a mistyped confirmation is not something
    // the server can see, because both fields are the same person's intent.
    if (password !== confirm) {
      setError("Those two passwords are not the same.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await resetPassword({
      newPassword: password,
      token: token!,
    });

    if (result.error) {
      setBusy(false);
      setError(
        result.error.message ??
          "That link did not work. It may have expired, or already been used.",
      );
      return;
    }

    setDone(true);
  }

  if (!token) {
    return (
      <Shell>
        <Typography variant="h2">
          {rejected ? "That link has expired" : "That link is incomplete"}
        </Typography>
        <Typography variant="body1" color="text.muted">
          {rejected
            ? "Reset links last an hour and work once, so this one has either " +
              "been used already or been sitting in the inbox too long. " +
              "Nothing is wrong with the account."
            : "It is missing the part that says who it is for, which usually " +
              "means it was cut short by the mail app it was opened from."}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <Link href="/forgot-password">Ask for a new link</Link>
        </Typography>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Typography variant="h2">Password changed</Typography>
        <Typography variant="body1" color="text.muted">
          You have been signed out everywhere else, so anyone using your account
          on another device will need the new password.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            router.push("/sign-in");
            router.refresh();
          }}
        >
          Sign in
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Stack component="form" onSubmit={handleSubmit} spacing={2.5}>
        <Box>
          <Typography variant="h2">Choose a new password</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            This link works once. Pick something you have not used here before.
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          autoFocus
          helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />

        <TextField
          label="New password again"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || password.length < MIN_PASSWORD_LENGTH}
        >
          {busy ? "Working…" : "Change my password"}
        </Button>
      </Stack>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ maxWidth: 420, mx: "auto", mt: 6 }}>
      <Card>
        <CardContent>
          <Stack spacing={2}>{children}</Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
