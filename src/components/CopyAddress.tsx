"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useState } from "react";

import { fonts } from "@/theme/theme";

/**
 * Trivet's address for AI assistants, with a Copy button: the one thing a
 * person has to paste into their assistant (MCP-PLAN.md). Drawn on the
 * assistants board (https://claude.ai/artifact/GroZmtNXWFLMiFvP7jNn6b).
 *
 * The field is read-only but selectable, so where the clipboard is refused
 * (an old browser, a page not served over HTTPS) the address can still be
 * copied by hand.
 */
export function CopyAddress({
  address,
  children,
  stacked = false,
}: {
  address: string;
  /** Anything that goes beside the Copy button, such as a help link. */
  children?: React.ReactNode;
  /** Field above the button, as on a narrow card. */
  stacked?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused: the field stays selectable, which is the fallback.
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: stacked ? "column" : { xs: "column", sm: "row" },
        alignItems: stacked ? "stretch" : { xs: "stretch", sm: "center" },
        gap: 1.25,
      }}
    >
      <Box
        component="input"
        type="text"
        readOnly
        value={address}
        aria-label="Trivet's address for assistants"
        onFocus={(event: React.FocusEvent<HTMLInputElement>) =>
          event.currentTarget.select()
        }
        sx={{
          // Grows along a row; in a column it keeps its own height.
          flex: stacked ? "none" : { xs: "none", sm: 1 },
          minWidth: 0,
          boxSizing: "border-box",
          height: 48,
          px: 1.5,
          border: "1px solid",
          borderColor: "dividerDashed",
          bgcolor: "background.default",
          color: "text.primary",
          fontFamily: fonts.serif,
          fontSize: { xs: "1.0625rem", sm: "1.1875rem" },
          borderRadius: 0,
          outline: "none",
          "&:focus-visible": { borderColor: "primary.main" },
        }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 2.5 }}>
        <Button
          variant="contained"
          onClick={copy}
          aria-live="polite"
          sx={{ height: 46, px: 3, flexShrink: 0 }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        {children}
      </Box>
    </Box>
  );
}
