"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import InputBase from "@mui/material/InputBase";
import LinearProgress from "@mui/material/LinearProgress";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import type { Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  discardUploadAction,
  saveExtractedRecipeAction,
} from "@/app/upload/actions";
import { heicToJpeg } from "@/lib/heic";
import { hostLabel, normaliseAddress } from "@/lib/recipe-address";
import type { ExtractedRecipe, RecipeInput } from "@/lib/recipe-schema";
import { recipePath } from "@/lib/recipe-url";
import { fonts } from "@/theme/theme";

import { PaperNote } from "./PaperNote";
import { RecipePhoto } from "./RecipePhoto";
import { RecipeForm } from "./RecipeForm";

/** A little beyond the server's own 60s ceiling. */
const UPLOAD_TIMEOUT_MS = 70_000;

/** So the shelf label and the field are a real label/control pair. */
const ADDRESS_FIELD_ID = "recipe-address";

type ExistingRecipe = { id: string; publicId: string; title: string };

/** Which half of the card is working. One model call at a time. */
type Half = "link" | "file";

type RecipeSource = "PDF" | "PHOTO" | "URL";

/**
 * A page that did not come back, and what to say about it.
 *
 * The server sends the fact; the wording lives here. A revision to this copy
 * is then a change to one component rather than a deployment of the API.
 */
type Handoff = {
  kind: "refused" | "timeout" | "missing" | "error";
  /** `halfbakedharvest.com`. */
  host: string;
  /** `halfbakedharvest.com/soup`: the address as the copy says it back. */
  address: string;
  /** The whole address, for the inline link. */
  url: string;
};

type Extracted = {
  recipe: ExtractedRecipe;
  source: RecipeSource;
  sourceFileUrl: string | null;
  sourceFileName: string | null;
  sourceFileType: string | null;
  sourceFileSha256: string | null;
  imageUrl: string | null;
  /** Recipes already in the library whose titles look like this one. */
  similar: ExistingRecipe[];
};

const confidenceCopy: Record<ExtractedRecipe["confidence"], string> = {
  high: "Read cleanly. Worth a skim before saving.",
  medium: "Read with some uncertainty — check the amounts.",
  low: "This may not be a recipe, or it read badly. Check every field.",
};

/**
 * What to say about how well it read.
 *
 * A low confidence on a URL is a different fact from a low confidence on a
 * photograph, and the existing line - "this may not be a recipe, or it read
 * badly" - describes a blurry snapshot of a shopping list. A URL is a page
 * somebody chose, and what has almost certainly happened is that the
 * ingredients came through and the method did not. The remedy for that is the
 * same handoff the link half offers, not "check every field".
 *
 * The longest string in the flow, and it earns it: this is the one place
 * somebody can save half a recipe without noticing.
 */
function confidenceLine(recipe: ExtractedRecipe, source: RecipeSource): string {
  if (source !== "URL" || recipe.confidence !== "low") {
    return confidenceCopy[recipe.confidence];
  }

  const site = recipe.sourceUrl ? hostLabel(recipe.sourceUrl) : "that site";
  return (
    "Only part of that page came through. Some sites show the full method " +
    "to a browser and a teaser to everything else, so read the steps before " +
    "saving — and if they are missing, discard this, print the page from " +
    `${site} yourself and upload the PDF.`
  );
}

export function UploadWorkflow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Half | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [address, setAddress] = useState("");
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<ExistingRecipe | null>(null);

  /**
   * The long placeholder does not fit beside the shelf label on a phone, and
   * letting it ellipsis would show half a sentence. Say it in fewer words
   * instead - the same rule, and the same post-mount resolution, the search
   * field uses: `noSsr` would make the first client render disagree with the
   * HTML it is hydrating, and spend a real mismatch on a placeholder.
   */
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  // Reading a card takes tens of seconds, and a page can take longer still.
  // Without a counter there is no way to tell a slow extraction from a wedged
  // one, and people re-submit.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);

  /** Everything either half clears before it starts. */
  function startWork(half: Half) {
    setBusy(half);
    setElapsed(0);
    setError(null);
    setHandoff(null);
    setAddressInvalid(false);
    setDuplicateOf(null);
  }

  async function handleFile(file: File) {
    startWork("file");

    // An iPhone photograph of a card arrives as HEIC unless the picker chose
    // to transcode it, and nothing downstream can read one: not the model, not
    // the server's own validation. Converting here means the upload succeeds
    // instead of failing politely after the wait.
    const body = new FormData();
    body.append("file", await heicToJpeg(file));

    // Slightly beyond the server's own ceiling, so a server-side timeout
    // reports its own error rather than being masked by this one. Without any
    // limit a wedged request spins indefinitely with no way out but a reload.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      // An error page from a proxy or a platform timeout is not JSON, and
      // parsing it would throw a syntax error that says nothing useful.
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // 409 carries the recipe it matched, so the message can link to it
        // instead of leaving someone to search for it.
        if (payload?.duplicateOf) setDuplicateOf(payload.duplicateOf);
        // The server names its own failures. Only guess when it could not -
        // and then guess nothing: claiming a cause we do not know sends people
        // looking in the wrong place.
        setError(
          payload?.error ??
            `Upload failed (${response.status}). Nothing was saved.`,
        );
        return;
      }

      setExtracted(payload as Extracted);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? "That card took too long to read. Try a shorter or smaller one, or add the recipe by hand."
          : "Upload failed. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(null);
    }
  }

  async function handleAddress(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    // The lenient parse gets its go first: a pasted `smittenkitchen.com/...`
    // is an address, and supplying the scheme is this app's job rather than
    // somebody else's typing. Only what is left after that is a typo, and
    // saying so here is worth it because a round trip and a model call for a
    // typo is a rude four seconds.
    const normalised = normaliseAddress(address);
    if (!normalised) {
      setAddressInvalid(true);
      setHandoff(null);
      setError(null);
      return;
    }

    startWork("link");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalised }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // A refusal, a timeout or a dead address is not an error banner: it
        // is a handoff to the file half directly below, said in the note that
        // half can be pointed at from.
        if (payload?.handoff) {
          setHandoff(payload.handoff as Handoff);
        } else {
          setError(
            payload?.error ??
              `That page could not be read (${response.status}). Nothing was saved.`,
          );
        }
        return;
      }

      setExtracted(payload as Extracted);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        // The client's own ceiling, reached before the server could report
        // its own. As far as anybody reading this is concerned the same thing
        // happened, so it gets the same note.
        setHandoff({
          kind: "timeout",
          host: hostLabel(normalised),
          address: hostLabel(normalised),
          url: normalised,
        });
      } else {
        setError(
          "That page could not be read. Check your connection and try again.",
        );
      }
    } finally {
      clearTimeout(timeout);
      setBusy(null);
    }
  }

  if (extracted) {
    const { recipe, ...assets } = extracted;
    const fromUrl = extracted.source === "URL";
    const initial: RecipeInput = {
      title: recipe.title,
      description: recipe.description ?? null,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes ?? null,
      cookMinutes: recipe.cookMinutes ?? null,
      restMinutes: recipe.restMinutes ?? null,
      ovenTemp: recipe.ovenTemp ?? null,
      ovenTempUnit: recipe.ovenTempUnit ?? null,
      yieldNote: recipe.yieldNote ?? null,
      equipment: recipe.equipment,
      // Filled by the URL path, null from a file, which has no address to
      // carry. Provenance is editable data on the recipe and nothing in the
      // chrome: the person is not told which path read it, because the only
      // thing that should change what they do next is how much to check, and
      // confidence already carries that.
      sourceUrl: recipe.sourceUrl ?? null,
      sourceName: recipe.sourceName ?? null,
      notes: recipe.notes ?? null,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      tags: recipe.tags,
    };

    return (
      <Stack spacing={3}>
        <Alert severity={recipe.confidence === "low" ? "warning" : "info"}>
          {confidenceLine(recipe, extracted.source)}
        </Alert>

        {extracted.similar.length > 0 ? (
          <Alert severity="warning">
            The library already has{" "}
            {extracted.similar.map((match, index) => (
              <span key={match.id}>
                {index > 0 ? ", " : ""}
                <Link href={recipePath(match)}>{match.title}</Link>
              </span>
            ))}
            . This is a different file, so it may be a better copy of the same
            dish — or a different recipe that happens to share a name. Saving
            adds it alongside.
          </Alert>
        ) : null}

        {assets.imageUrl ? (
          <RecipePhoto
            src={assets.imageUrl}
            height={{ xs: 180, sm: 280 }}
            rounded={2}
            sizes="(max-width: 900px) 100vw, 900px"
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {fromUrl
              ? "No photo came back from that page. You can add one after saving."
              : extracted.source === "PHOTO"
                ? "A photo of the card is not a photo of the dish, so none was set. You can add one after saving."
                : "No usable photo was found in the PDF."}
          </Typography>
        )}

        <RecipeForm
          initial={initial}
          submitLabel="Add to the library"
          onSubmit={async (values) => {
            const result = await saveExtractedRecipeAction(values, assets);
            if (result && result.ok === false) return result;
          }}
        />

        <Box>
          <Button
            disabled={discarding}
            onClick={async () => {
              setDiscarding(true);
              // Remove the stored card and photo: nothing will reference them
              // once this draft is gone.
              await discardUploadAction(assets);
              setExtracted(null);
              setAddress("");
              setDiscarding(false);
            }}
          >
            {fromUrl
              ? "Discard and start again"
              : "Discard and upload a different card"}
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error ? (
        <Alert severity={duplicateOf ? "info" : "error"}>
          {error}
          {duplicateOf ? (
            <>
              {" "}
              <Link href={recipePath(duplicateOf)}>Open it</Link>, or pick a
              different file.
            </>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          {/*
           * One card, two addressed halves, link above file - and that
           * ordering is load-bearing rather than a guess about which is more
           * popular. A third of recipe sites refuse a server outright, and
           * the answer to a refusal is "print the page yourself and bring
           * that in below": a sentence whose last word is only true while the
           * file picker is on the same screen, directly underneath. Behind a
           * tab or a route it becomes a navigation instruction, which reads
           * as a dead end however politely it is worded.
           *
           * `noValidate` because `type="url"` would otherwise have the
           * browser refuse `smittenkitchen.com/...` before the lenient parse
           * that exists to accept it ever runs.
           */}
          <Box component="form" onSubmit={handleAddress} noValidate>
            <Box
              sx={{
                display: "flex",
                // The 11px label sits on the field's baseline rather than
                // halfway up its line.
                alignItems: "baseline",
                columnGap: { xs: "10px", md: "14px" },
                // The rule belongs to the field's own zone and stops where
                // the field stops, which is what makes it an underline rather
                // than a section divider. Borrowed from `RecipeSearchBar`,
                // along with the label beside rather than above.
                borderBottom: "1px solid",
                borderColor: "text.primary",
                pb: "12px",
                // The field is the whole zone, not just the glyphs in it.
                cursor: "text",
                "&:hover > label, &:focus-within > label": {
                  color: "text.primary",
                },
              }}
            >
              <Typography
                component="label"
                htmlFor={ADDRESS_FIELD_ID}
                variant="overline"
                sx={{
                  flexShrink: 0,
                  color: "text.secondary",
                  cursor: "pointer",
                  transition: "color 120ms",
                }}
              >
                A link
              </Typography>

              {/*
               * Karla at 1rem, where the search field is serif at 1.625rem.
               * The two fields are not drifting apart by accident: the
               * theme's own line is that prose is serif and data is not, and
               * a pasted URL is the most data-like string anybody will put
               * into this app. There is a practical half - at the search
               * field's size a ninety-character address shows about
               * twenty-five characters, and somebody who cannot see what they
               * pasted cannot check it. The placeholder is not italic for the
               * same reason: the italic belongs to the serif field's idiom,
               * and carrying it over would say these are the same kind of
               * thing.
               */}
              <InputBase
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  if (addressInvalid) setAddressInvalid(false);
                }}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  compact
                    ? "Paste a recipe address"
                    : "Paste the address of a recipe page"
                }
                inputProps={{
                  id: ADDRESS_FIELD_ID,
                  "aria-label": "A link to a recipe page",
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  // The field's zone owns the padding above its rule; the
                  // input must not add a second helping of it.
                  p: 0,
                  fontFamily: fonts.sans,
                  fontSize: "1rem",
                  color: "text.primary",
                  "& input::placeholder": {
                    color: "text.secondary",
                    // Browsers dim placeholders by default, which on this
                    // palette leaves it almost invisible.
                    opacity: 1,
                  },
                }}
              />
            </Box>

            {/*
             * The field telling you about itself, rather than the page
             * telling you something - so a line under the field rather than a
             * note.
             */}
            {addressInvalid ? (
              <Typography
                variant="body2"
                sx={{ color: "secondary.main", mt: 1 }}
              >
                That isn&apos;t a web address.
              </Typography>
            ) : null}

            {/*
             * Contained, like the file half's button. Two contained buttons
             * in one card is deliberate: each half has exactly one action and
             * they are siblings rather than a primary and a secondary. An
             * outlined button here would rank them, and beside a text field
             * it would read as a third empty box.
             */}
            <Box sx={{ mt: 2.5 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy !== null}
              >
                {busy === "link"
                  ? elapsed > 0
                    ? `Reading the page… ${elapsed}s`
                    : "Reading the page…"
                  : "Read the page"}
              </Button>
            </Box>

            {busy === "link" ? <LinearProgress sx={{ mt: 2 }} /> : null}

            {handoff ? (
              <Box sx={{ mt: 2.5 }}>
                <HandoffNote handoff={handoff} />
              </Box>
            ) : null}
          </Box>

          {/*
           * The divider between the halves - except when the note above drew
           * one. `PaperNote` carries its own top and bottom hairlines, so a
           * second rule here would touch its bottom border and the two would
           * read as one 2px line.
           */}
          <Box
            sx={{
              mt: handoff ? 0 : 4,
              pt: handoff ? 3 : 4,
              borderTop: handoff ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Typography
              variant="overline"
              component="p"
              sx={{ color: "text.secondary" }}
            >
              A file
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              A PDF, or a photograph of a printed or handwritten card. Up to 20
              MB.
            </Typography>

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                // Reset so re-picking the same file fires change again.
                event.target.value = "";
              }}
            />

            <Box sx={{ mt: 2.5 }}>
              <Button
                variant="contained"
                size="large"
                disabled={busy !== null}
                onClick={() => inputRef.current?.click()}
              >
                {busy === "file"
                  ? elapsed > 0
                    ? `Reading the card… ${elapsed}s`
                    : "Reading the card…"
                  : "Select a PDF or photo"}
              </Button>
            </Box>

            {busy === "file" ? <LinearProgress sx={{ mt: 2 }} /> : null}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

/**
 * What the page says when a site will not answer it.
 *
 * A note rather than an `Alert`, and that is the whole point of the state: a
 * coloured fill, an icon and a radius are three things this design has
 * nowhere else, and spending all three on a site's bot policy would make it
 * the loudest object on the page - on the one state that specifically must
 * not read as a failure. Nobody did anything wrong and nothing is broken, so
 * there is no apology in here, no "sorry", no "failed". The absence of one is
 * the reassurance.
 *
 * A timeout and a refusal have the same remedy, so they are one object with
 * two first clauses. "below" is literally true because the file half is
 * directly underneath; if that ordering ever changes, this word changes with
 * it. "Choose Print, then Save as PDF" is OS-neutral and is the whole
 * procedure - a keyboard shortcut would be wrong on half the machines that
 * see this.
 */
function HandoffNote({ handoff }: { handoff: Handoff }) {
  if (handoff.kind === "missing") {
    // There is nothing to print, so the remedy is the address rather than the
    // handoff - and the address is not a link, because it leads nowhere.
    return (
      <PaperNote label="That address didn't lead anywhere" live>
        Nothing is at {handoff.address}. Check the address, or paste it again
        from wherever you found it.
      </PaperNote>
    );
  }

  const site = (
    <MuiLink href={handoff.url} target="_blank" rel="noopener noreferrer">
      {handoff.host}
    </MuiLink>
  );

  return (
    <PaperNote label="This one needs your browser" live>
      {handoff.kind === "timeout" ? (
        <>{site} didn&apos;t answer in time.</>
      ) : handoff.kind === "error" ? (
        <>{site} didn&apos;t answer with a web page.</>
      ) : (
        <>
          {site} only answers a real browser, so there was nothing for Trivet to
          read.
        </>
      )}{" "}
      Open it yourself, print the page to a PDF — choose Print, then Save as PDF
      — and bring that in below. It reads just as well.
    </PaperNote>
  );
}
