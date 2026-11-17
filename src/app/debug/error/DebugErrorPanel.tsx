"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import * as Sentry from "@sentry/nextjs";
import { useState, useTransition } from "react";

import { reportCaughtFailure, writeLogLine } from "./actions";
import { TEST_PREFIX } from "./test-prefix";

/** Throws while rendering, the way a broken component does in the browser. */
function BrowserCrash(): never {
  Sentry.setTag("debug", "true");
  throw new Error(`${TEST_PREFIX}: browser crash`);
}

export function DebugErrorPanel() {
  const [crash, setCrash] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<string>) =>
    startTransition(async () => setResult(await action()));

  return (
    <Stack spacing={2} sx={{ alignItems: "flex-start", maxWidth: 560 }}>
      {crash ? <BrowserCrash /> : null}

      {/*
       * A plain link with a full load: the server throws while rendering, and
       * the error page that follows is part of what is being tested.
       */}
      <Button variant="outlined" href="/debug/error?throw=server">
        Crash the server
      </Button>
      <Button variant="outlined" onClick={() => setCrash(true)}>
        Crash the browser
      </Button>
      <Button
        variant="outlined"
        disabled={pending}
        onClick={() => run(reportCaughtFailure)}
      >
        Report a caught failure
      </Button>
      <Button
        variant="outlined"
        disabled={pending}
        onClick={() => run(writeLogLine)}
      >
        Write a log line
      </Button>

      {result ? <Typography role="status">{result}</Typography> : null}
    </Stack>
  );
}
