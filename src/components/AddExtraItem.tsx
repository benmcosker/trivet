"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { addExtraItemAction } from "@/app/plan/extra-actions";
import { fonts } from "@/theme/theme";

import { PaperNote } from "./PaperNote";

/**
 * A line to write on, rather than a box to fill in.
 *
 * The same treatment as the recipe search: no outline, a hairline under the
 * text, and the placeholder doing the work a label would. Two outlined fields
 * and a filled button were the last three boxes on a page that no longer has
 * any.
 *
 * The placeholder is `text.secondary` and not `text.disabled`, which is where
 * the search bar still has it. At 21px, non-bold, `text.disabled` measures
 * 3.85:1 - under the 4.5 a string this size needs, and this one is the only
 * thing telling you what the field is for.
 */
const FIELD_SX = {
  flex: 1,
  minWidth: 0,
  fontFamily: fonts.serif,
  fontSize: "21px",
  color: "text.primary",
  "& input": { p: 0 },
  "& input::placeholder": {
    fontStyle: "italic",
    fontWeight: 300,
    color: "text.secondary",
    // Browsers dim placeholders by default, which on this palette leaves it
    // almost invisible.
    opacity: 1,
  },
};

/**
 * Putting something on the week that no recipe asked for.
 *
 * Amount is a second field rather than something read out of the name,
 * because splitting "2 lemons" into a number and a noun works right up until
 * somebody types "7 Up". Two fields ask the question plainly and never guess
 * wrong; the amount is free text, so "a big bag" is a valid answer.
 */
export function AddExtraItem({ weekStartIso }: { weekStartIso: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);

    startTransition(async () => {
      const result = await addExtraItemAction(
        { name: trimmed, amount: amount.trim() || null },
        weekStartIso,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <Box
      component="form"
      onSubmit={add}
      sx={{
        mt: { xs: 5, md: 7 },
        pt: "22px",
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "baseline",
          columnGap: "14px",
          rowGap: 1.25,
          flexWrap: "wrap",
        }}
      >
        {/*
         * Its own line on a phone. Beside the field there is not room for a
         * label, two inputs and a button, and letting them wrap where they
         * liked left the button stranded on a line of its own.
         */}
        <Typography
          variant="overline"
          component="span"
          sx={{
            color: "text.secondary",
            flexShrink: 0,
            flexBasis: { xs: "100%", sm: "auto" },
          }}
        >
          Add something
        </Typography>

        {/*
         * One rule under both fields rather than one each, so the row reads
         * as a single line you are writing on.
         */}
        <Stack
          direction="row"
          sx={{
            flex: "1 1 180px",
            minWidth: 0,
            alignItems: "baseline",
            gap: { xs: 1.25, sm: 2 },
            pb: "8px",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <InputBase
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            placeholder="Foil, paper towels, whatever else…"
            // The placeholder says what the field is for, and a visible label
            // above it would undo the treatment.
            inputProps={{ "aria-label": "Something else you need" }}
            sx={FIELD_SX}
          />
          {/*
           * Amount is a second field rather than something read out of the
           * name, because splitting "2 lemons" into a number and a noun works
           * right up until somebody types "7 Up". Free text, so "a big bag"
           * is a valid answer - and wide enough to hold it without taking the
           * room the name needs.
           */}
          <InputBase
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={pending}
            placeholder="How much?"
            inputProps={{ "aria-label": "How much" }}
            sx={{ ...FIELD_SX, flex: "0 0 auto", width: { xs: 72, sm: 124 } }}
          />
        </Stack>

        <Button
          type="submit"
          disabled={pending || !name.trim()}
          sx={{ flexShrink: 0 }}
        >
          Add
        </Button>
      </Stack>

      {error ? (
        <Box sx={{ mt: 2.5 }}>
          <PaperNote label="That did not work" live>
            {error}
          </PaperNote>
        </Box>
      ) : null}
    </Box>
  );
}
