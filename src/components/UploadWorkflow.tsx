"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import ButtonBase from "@mui/material/ButtonBase";
import CardContent from "@mui/material/CardContent";
import InputBase from "@mui/material/InputBase";
import LinearProgress from "@mui/material/LinearProgress";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import type { Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";

import {
  discardUploadAction,
  saveExtractedRecipeAction,
} from "@/app/upload/actions";
import { heicToJpeg } from "@/lib/heic";
import { PASTED_TEXT_REFUSAL, readPastedText } from "@/lib/pasted-text";
import { hostLabel, normaliseAddress } from "@/lib/recipe-address";
import type { ExtractedRecipe, RecipeInput } from "@/lib/recipe-schema";
import { recipePath } from "@/lib/recipe-url";
import {
  shareBridge,
  sharedLabel,
  sharedSentence,
  takeSharedItem,
  type SharedSummary,
} from "@/lib/shared-item";
import { fonts } from "@/theme/theme";

import { PaperNote } from "./PaperNote";
import { RecipePhoto } from "./RecipePhoto";
import { RecipeForm } from "./RecipeForm";

/** A little beyond the server's own 60s ceiling. */
const UPLOAD_TIMEOUT_MS = 70_000;

/** So the shelf label and the field are a real label/control pair. */
const ADDRESS_FIELD_ID = "recipe-address";
const TEXT_FIELD_ID = "recipe-text";

type ExistingRecipe = { id: string; publicId: string; title: string };

/** Which part of the card is working. One model call at a time. */
type Half = "link" | "file" | "text";

type RecipeSource = "PDF" | "PHOTO" | "URL" | "TEXT";

/**
 * A page that did not come back, and what to say about it.
 *
 * The server sends the fact; the wording lives here. A revision to this copy
 * is then a change to one component rather than a deployment of the API.
 */
type Handoff = {
  kind: "refused" | "busy" | "timeout" | "missing" | "error";
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

export function UploadWorkflow({
  sharedUrl = null,
  sharedFromApp = false,
}: {
  /**
   * A link handed to the page in its address, `/upload?url=…`, by the iPhone
   * share sheet. Filled in and read straight away, so sharing a recipe page
   * lands on it being read rather than on an empty field.
   */
  sharedUrl?: string | null;
  /**
   * `/upload?shared=1`: the app has screenshots' words, photos or a PDF from
   * the share sheet waiting, and hands them over once the page asks
   * (`shared-item.ts`). Ignored outside the app.
   */
  sharedFromApp?: boolean;
} = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Half | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [address, setAddress] = useState(sharedUrl ?? "");
  const [addressInvalid, setAddressInvalid] = useState(false);
  const addressRef = useRef<HTMLInputElement | null>(null);

  /**
   * Empty the address and put the caret back in it.
   *
   * The focus call runs before React commits the removal of the Clear that
   * called it, so focus lands on the field rather than on the document - the
   * control removes itself the moment it works.
   */
  function clearAddress() {
    addressRef.current?.focus();
    setAddress("");
    setAddressInvalid(false);
  }
  const [pasted, setPasted] = useState("");
  const [pastedRefusal, setPastedRefusal] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<ExistingRecipe | null>(null);
  /**
   * What the share sheet handed over, and which half is reading it. While it
   * is set that half comes first on the card, under a band saying what
   * arrived; starting any other half puts the card back in its usual order.
   */
  const [arrival, setArrival] = useState<{
    half: Half;
    summary: SharedSummary;
  } | null>(null);

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
    setArrival((current) => (current?.half === half ? current : null));
    setBusy(half);
    setElapsed(0);
    setError(null);
    setHandoff(null);
    setAddressInvalid(false);
    setPastedRefusal(null);
    setDuplicateOf(null);
  }

  async function handleFiles(files: File[]) {
    startWork("file");

    // An iPhone photograph of a card arrives as HEIC unless the picker chose
    // to transcode it, and nothing downstream can read one: not the model, not
    // the server's own validation. Converting here means the upload succeeds
    // instead of failing politely after the wait.
    //
    // Several photos are one recipe across screens or sides of a card, sent
    // together and read as one. They are shrunk first: a request is capped
    // at a few megabytes, and three full-size screenshots would pass it.
    const body = new FormData();
    let total = 0;
    for (const file of files) {
      const jpeg = await heicToJpeg(file);
      const ready = files.length > 1 ? await shrinkPhoto(jpeg) : jpeg;
      total += ready.size;
      body.append("file", ready);
    }
    if (files.length > 1 && total > MAX_PHOTOS_BYTES) {
      setError(
        "Those photos are too large to send together. Try fewer, or crop them to the recipe.",
      );
      setBusy(null);
      return;
    }

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
    await readAddress(address);
  }

  async function readAddress(raw: string) {
    if (busy) return;

    // The lenient parse gets its go first: a pasted `smittenkitchen.com/...`
    // is an address, and supplying the scheme is this app's job rather than
    // somebody else's typing. Only what is left after that is a typo, and
    // saying so here is worth it because a round trip and a model call for a
    // typo is a rude four seconds.
    const normalised = normaliseAddress(raw);
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

  async function handleText(event: FormEvent) {
    event.preventDefault();
    await readText(pasted);
  }

  /**
   * `origin` is "screenshots" for words the share sheet read off screenshots,
   * which the model is told to expect the app's own words in.
   */
  async function readText(raw: string, origin?: "screenshots") {
    if (busy) return;

    // The same checks the route makes, here first so an empty or one-line
    // paste is answered at once rather than after a round trip.
    const checked = readPastedText(raw);
    if (!checked.ok) {
      setPastedRefusal(PASTED_TEXT_REFUSAL[checked.reason]);
      setError(null);
      return;
    }

    startWork("text");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch("/api/import-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: checked.text, origin }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          payload?.error ??
            `That text could not be read (${response.status}). Nothing was saved.`,
        );
        return;
      }

      setExtracted(payload as Extracted);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? "That took too long to read. Try again, or add the recipe by hand."
          : "That text could not be read. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(null);
    }
  }

  /*
   * Read a shared link once, on arrival. The address is then tidied back to
   * plain /upload, so a reload or a trip back does not read it a second time.
   */
  const sharedRead = useRef(false);
  useEffect(() => {
    if (!sharedUrl || sharedRead.current) return;
    sharedRead.current = true;
    window.history.replaceState(null, "", "/upload");
    void readAddress(sharedUrl);
    // Once, for the link the page arrived with; later edits are typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  /*
   * Take what the share sheet left with the app, once, and read it. The app
   * forgets it only after every file has arrived, so a page that fails here
   * leaves it waiting for the next time Trivet comes forward.
   */
  const sharedTaken = useRef(false);
  useEffect(() => {
    if (!sharedFromApp || sharedTaken.current) return;
    sharedTaken.current = true;
    window.history.replaceState(null, "", "/upload");
    const bridge = shareBridge();
    if (!bridge) return;

    void (async () => {
      let item: Awaited<ReturnType<typeof takeSharedItem>>;
      try {
        item = await takeSharedItem(bridge);
      } catch {
        setError(
          "What you shared didn't come through. Share it to Trivet again, or add it below.",
        );
        return;
      }
      if (!item) return;
      void bridge.postMessage({ type: "taken" }).catch(() => {});

      if (item.kind === "text") {
        setPasted(item.summary.text);
        setArrival({ half: "text", summary: item.summary });
        await readText(
          item.summary.text,
          item.summary.screenshots ? "screenshots" : undefined,
        );
      } else {
        setArrival({ half: "file", summary: item.summary });
        await handleFiles(item.files);
      }
    })();
    // Once, for what the page arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFromApp]);

  if (extracted) {
    const { recipe, ...assets } = extracted;
    const fromUrl = extracted.source === "URL";
    const fromText = extracted.source === "TEXT";
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
      // The review screen is the only check these figures get: nothing
      // downstream can tell a misread 820 from a printed 620, so this is
      // where a person has to see them beside the card they came off.
      caloriesKcal: recipe.caloriesKcal ?? null,
      proteinG: recipe.proteinG ?? null,
      carbsG: recipe.carbsG ?? null,
      fatG: recipe.fatG ?? null,
      // Worked out from the ingredients because the source printed none.
      // The form says so, and stops saying so once a figure is changed.
      nutritionEstimated: recipe.nutritionEstimated ?? false,
      // What the importer read the dish as. Shown on the review form so a
      // wrong guess is corrected before it is saved, not after.
      course: recipe.course ?? null,
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
              : fromText
                ? "Pasted text has no photo of the dish. You can add one after saving."
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
              setPasted("");
              setDiscarding(false);
            }}
          >
            {fromUrl || fromText
              ? "Discard and start again"
              : "Discard and upload a different card"}
          </Button>
        </Box>
      </Stack>
    );
  }

  /*
   * Link, file, text: the usual order, and the link half's handoff note says
   * "below" of the file half because it is directly underneath. Something
   * shared from the phone puts its own half first instead, so it is read at
   * the top of the page rather than off the bottom of it; any other half
   * starting clears the arrival, which brings the usual order back before a
   * handoff note can appear.
   */
  const order: Half[] =
    arrival?.half === "file"
      ? ["file", "link", "text"]
      : arrival?.half === "text"
        ? ["text", "link", "file"]
        : ["link", "file", "text"];

  /** The rule above a half, unless it is first or a note already drew one. */
  function placement(half: Half) {
    const index = order.indexOf(half);
    if (index === 0) return {};
    // `PaperNote` carries its own top and bottom hairlines, so a second rule
    // under the link half's note would touch it and read as one 2px line.
    if (half === "file" && order[index - 1] === "link" && handoff) {
      return { pt: 3 };
    }
    return { mt: 4, pt: 4, borderTop: 1, borderColor: "divider" };
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

      {arrival && busy === arrival.half ? (
        <SharedBand summary={arrival.summary} />
      ) : null}

      <Card>
        <CardContent>
          {order.map((half) => (
            <Fragment key={half}>
              {half === "link" ? (
                <>
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
                  <Box
                    component="form"
                    onSubmit={handleAddress}
                    noValidate
                    sx={placement("link")}
                  >
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
                        inputRef={addressRef}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape" || !address) return;
                          event.preventDefault();
                          clearAddress();
                        }}
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

                      {/*
                       * The same Clear the recipes search carries, for the same
                       * reason and in the same word: the page owns one word for this
                       * act, and spelling it a second way here would be two
                       * vocabularies for one idea. It sits inside the field's rule at
                       * the far end of it, so it empties the box it is drawn inside
                       * and nothing else - the button below and the file half are not
                       * its business.
                       *
                       * Only while there is something to clear. A pasted address is
                       * long, and often the wrong one, and getting back to an empty
                       * field should not mean holding backspace over ninety
                       * characters.
                       */}
                      {address ? (
                        <ButtonBase
                          onClick={clearAddress}
                          aria-label="Clear the address"
                          sx={(theme) => ({
                            flexShrink: 0,
                            position: "relative",
                            ...theme.typography.overline,
                            color: "text.secondary",
                            transition: "color 120ms",
                            "&:hover, &:focus-visible": {
                              color: "text.primary",
                            },
                            // The word is 11px; the target it answers to is not. It
                            // grows leftwards over the end of the field rather than
                            // symmetrically, so it cannot take a tap meant for
                            // anything to its right.
                            "&::after": {
                              content: '""',
                              position: "absolute",
                              inset: "-16px -2px -16px -22px",
                            },
                          })}
                        >
                          Clear
                        </ButtonBase>
                      ) : null}
                    </Box>

                    {/*
                     * The link half's description, the sibling of the file half's.
                     *
                     * Both halves name a shape and then a bound. The file half's
                     * bound is a limit (`Up to 20 MB.`); this one's is a generosity,
                     * and the asymmetry is the point - a file has to be small enough,
                     * a link only has to be a recipe.
                     *
                     * `One recipe` is doing the work: it excludes the search result,
                     * the Pinterest pin and the Instagram reel without scolding
                     * anybody, and those are the pastes that fail worst, because they
                     * extract *something* and it is confident and wrong.
                     *
                     * What it must never say is that almost any cooking site can be
                     * read automatically - eight of twenty-one measured sites refuse
                     * a server outright. It says where the recipe can end up, which
                     * is true of all of them: twelve by paste, the rest by the
                     * handoff. A sentence about the destination cannot be falsified
                     * by somebody's CDN.
                     */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      The page for one recipe. Almost any cooking site.
                    </Typography>

                    {/*
                     * The field telling you about itself, rather than the page
                     * telling you something - so a line under the field rather than a
                     * note.
                     *
                     * Below the line above, not instead of it: that one says what the
                     * field wants, this says what you gave it is not that, and a cook
                     * who has just been corrected can look up one line to see what
                     * they should have pasted.
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
                </>
              ) : half === "file" ? (
                <>
                  {/*
                   * The divider between the halves - except when the note above drew
                   * one (see `placement`). `PaperNote` carries its own top and bottom hairlines, so a
                   * second rule here would touch its bottom border and the two would
                   * read as one 2px line.
                   */}
                  <Box sx={placement("file")}>
                    <Typography
                      variant="overline"
                      component="p"
                      sx={{ color: "text.secondary" }}
                    >
                      A file
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      A PDF, a photo of a printed or handwritten card, or a
                      screenshot of a recipe, such as an Instagram caption. Up
                      to 20 MB. For a recipe that runs across screens or both
                      sides of a card, pick all the photos at once, in order.
                    </Typography>

                    <input
                      ref={inputRef}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      hidden
                      onChange={(event) => {
                        const picked = Array.from(event.target.files ?? []);
                        if (picked.length > 0) void handleFiles(picked);
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
                          : "Select a PDF or photos"}
                      </Button>
                    </Box>

                    {busy === "file" ? <LinearProgress sx={{ mt: 2 }} /> : null}
                  </Box>
                </>
              ) : (
                <>
                  {/*
                   * The third way in, last because it is the least common and because
                   * the link half's handoff note says "below" of the file half, which
                   * has to stay directly under it.
                   *
                   * Text copied anywhere a copy is possible: a message, a note, a page,
                   * a caption on Instagram's website. Neither Instagram's nor TikTok's
                   * app lets a caption be copied, which is why the file half above
                   * names the screenshot.
                   */}
                  <Box
                    component="form"
                    onSubmit={handleText}
                    noValidate
                    sx={placement("text")}
                  >
                    <Typography
                      component="label"
                      htmlFor={TEXT_FIELD_ID}
                      variant="overline"
                      sx={{ display: "block", color: "text.secondary" }}
                    >
                      Some text
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      A recipe copied from a message, a note or a page. Paste
                      the whole thing, ingredients and steps.
                    </Typography>

                    <InputBase
                      value={pasted}
                      onChange={(event) => {
                        setPasted(event.target.value);
                        if (pastedRefusal) setPastedRefusal(null);
                      }}
                      multiline
                      minRows={4}
                      maxRows={14}
                      placeholder="Paste a recipe"
                      inputProps={{ id: TEXT_FIELD_ID }}
                      sx={{
                        mt: 2,
                        width: "100%",
                        // The same underline the address field draws, so the two
                        // fields read as the same kind of thing at different sizes.
                        borderBottom: "1px solid",
                        borderColor: "text.primary",
                        pb: "12px",
                        fontFamily: fonts.sans,
                        fontSize: "1rem",
                        color: "text.primary",
                        "& textarea::placeholder": {
                          color: "text.secondary",
                          opacity: 1,
                        },
                      }}
                    />

                    {pastedRefusal ? (
                      <Typography
                        variant="body2"
                        sx={{ color: "secondary.main", mt: 1 }}
                      >
                        {pastedRefusal}
                      </Typography>
                    ) : null}

                    <Box sx={{ mt: 2.5 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={busy !== null}
                      >
                        {busy === "text"
                          ? elapsed > 0
                            ? `Reading the text… ${elapsed}s`
                            : "Reading the text…"
                          : "Read the text"}
                      </Button>
                    </Box>

                    {busy === "text" ? <LinearProgress sx={{ mt: 2 }} /> : null}
                  </Box>
                </>
              )}
            </Fragment>
          ))}
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

  if (handoff.kind === "busy") {
    /*
     * Not a handoff at all: the site said yes, later. Printing the page would
     * be work nobody needed to do, so this note ends without the tail the
     * others share - there is nothing to hand off to.
     *
     * The wording does not say which "later" it is. This covers a 429, where
     * the site asked us to slow down, and a transient resolver failure, where
     * nobody asked anything - see `networkFailure` in `fetch-page.ts`. Both
     * leave the cook in the same position and want the same remedy, so the
     * copy states that position rather than guessing at the mechanism.
     */
    return (
      <PaperNote label="Try that one again in a minute" live>
        We couldn&apos;t get through to {site} just now. Nothing is wrong with
        the address — paste it again shortly and it should come through.
      </PaperNote>
    );
  }

  return (
    <PaperNote label="This one needs your browser" live>
      {handoff.kind === "timeout" ? (
        <>{site} didn&apos;t answer in time.</>
      ) : handoff.kind === "error" ? (
        <>{site} didn&apos;t answer with a web page.</>
      ) : (
        <>
          {site} is one of a few sites that only answer a real browser, so there
          was nothing for Trivet to read.
        </>
      )}{" "}
      Open it yourself, print the page to a PDF — choose Print, then Save as PDF
      — and bring that in below. It reads just as well.
    </PaperNote>
  );
}

/** What several photos may come to together, under the platform's cap. */
const MAX_PHOTOS_BYTES = 4 * 1024 * 1024;

/**
 * A smaller JPEG of a photo, for sending several at once.
 *
 * The model reads an image at about 1,600 pixels on its long side whatever
 * it is sent, so 2,000 loses nothing it would have seen. A photo already
 * small, or one the browser cannot redraw, is sent as it is.
 */
async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/**
 * What arrived from the share sheet, while it is read: a status band in the
 * raised paper with hairlines, the device the offline designs use for a
 * message that stays put. See design_handoff_trivet_share/.
 */
function SharedBand({ summary }: { summary: SharedSummary }) {
  return (
    <Box
      role="status"
      sx={{
        bgcolor: "background.raised",
        borderTop: 1,
        borderBottom: 1,
        borderColor: "divider",
        px: "20px",
        py: "12px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
        sx={{ width: 18, height: 18, flexShrink: 0, mt: "1px" }}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12" />
          <path d="M7.5 7.5 12 3l4.5 4.5" />
          <path d="M5 11v9.5h14V11" />
        </g>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        <Typography
          component="p"
          sx={{
            fontFamily: fonts.sans,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "text.primary",
          }}
        >
          {sharedLabel(summary)}
        </Typography>
        <Typography
          component="p"
          sx={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 15,
            lineHeight: 1.35,
            color: "text.muted",
          }}
        >
          {sharedSentence(summary)}
        </Typography>
      </Box>
    </Box>
  );
}
