"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The last resort: what shows when something breaks so badly that the root
 * layout cannot render, and the error is reported to Sentry from here.
 *
 * It replaces the whole document, so it brings its own <html> and <body>
 * and cannot use the theme: the paper colour and serif are written out, and
 * it follows the device's dark setting the same way the site does.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // An error with a digest came from the server, which has already
    // reported it in full (`onRequestError`). The browser only gets a copy
    // with the message stripped out - React error #441 - so reporting it
    // again would add an unreadable duplicate of every server crash.
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "light-dark(#f7f4ed, #14110d)",
          color: "light-dark(#1a1815, #f4efe4)",
          colorScheme: "light dark",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 32, fontWeight: 400, margin: "0 0 12px" }}>
            Something went wrong.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, margin: "0 0 24px" }}>
            Trivet hit a problem it could not recover from, and it has been
            reported. Reloading usually puts it right.
          </p>
          {/* A plain anchor: a full reload, not a move within a broken app. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              color: "inherit",
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Reload Trivet
          </a>
        </main>
      </body>
    </html>
  );
}
