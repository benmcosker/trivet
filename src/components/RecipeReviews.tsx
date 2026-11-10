"use client";

import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";

import {
  deleteReviewAction,
  saveReviewAction,
} from "@/app/recipes/review-actions";
import {
  MAX_BODY_LENGTH,
  MAX_STARS,
  type ReviewSummary,
  type ReviewWithAuthor,
} from "@/lib/review-schema";

import { ReportOrHide } from "./ReportOrHide";
import { ReviewStars } from "./ReviewStars";

/**
 * What the household thought, and your own say in it.
 *
 * The average sits at the top because it is the number people came for; the
 * form comes next so leaving a review does not mean scrolling past everyone
 * else's first.
 */
export function RecipeReviews({
  recipeId,
  summary,
  reviews,
  myReview,
  currentUserId,
  householdId,
}: {
  recipeId: string;
  summary: ReviewSummary;
  reviews: ReviewWithAuthor[];
  myReview: ReviewWithAuthor | null;
  currentUserId: string;
  /** The reader's household: a review from any other can be reported. */
  householdId: string;
}) {
  const others = reviews.filter((review) => review.author.id !== currentUserId);

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}
      >
        <Typography variant="h3">Reviews</Typography>
        <ReviewStars summary={summary} size="medium" />
      </Stack>

      <Divider sx={{ my: 2 }} />

      <ReviewForm recipeId={recipeId} myReview={myReview} />

      {others.length > 0 ? (
        <Stack spacing={2.5} sx={{ mt: 4 }}>
          {others.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              householdId={householdId}
            />
          ))}
        </Stack>
      ) : null}

      {reviews.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Nobody has reviewed this yet. If you cook it, say how it went.
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Your review: stars, and optionally why.
 *
 * Stars are required and the words are not. Requiring both would make a quick
 * verdict a chore, and requiring neither would put unscored notes into an
 * average that cannot count them.
 */
function ReviewForm({
  recipeId,
  myReview,
}: {
  recipeId: string;
  myReview: ReviewWithAuthor | null;
}) {
  const [stars, setStars] = useState<number | null>(myReview?.stars ?? null);
  const [body, setBody] = useState(myReview?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_BODY_LENGTH;
  // Nothing to save until a score is picked, since a review without one is a
  // note the average cannot use.
  const unchanged =
    stars === (myReview?.stars ?? null) && trimmed === (myReview?.body ?? "");

  const save = () => {
    if (stars === null || tooLong) return;
    setError(null);

    startTransition(async () => {
      const result = await saveReviewAction(recipeId, { stars, body: trimmed });
      if (!result.ok) setError(result.error);
    });
  };

  const withdraw = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteReviewAction(recipeId);
      if (result.ok) {
        setStars(null);
        setBody("");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {myReview ? "Your review" : "Add your review"}
      </Typography>

      <Rating
        name="your-stars"
        value={stars}
        max={MAX_STARS}
        size="large"
        disabled={pending}
        // MUI hands back null when someone clicks the star they already chose.
        // Keep the score rather than silently clearing it - withdrawing is what
        // the Remove button is for.
        onChange={(_, value) => setStars(value ?? stars)}
        // Not display:block. Rating's root is inline-flex, and that flex is
        // what lays the five stars out in a row - overriding it stacks them
        // vertically. The overline above is already block, so the stars start
        // on their own line without any help.
        sx={{ mt: 0.5 }}
      />

      <TextField
        label="What did you think? (optional)"
        placeholder="Used thighs instead of breast, needed ten more minutes."
        value={body}
        onChange={(event) => setBody(event.target.value)}
        multiline
        minRows={2}
        fullWidth
        disabled={pending}
        error={tooLong}
        helperText={
          tooLong
            ? `${trimmed.length} characters — the limit is ${MAX_BODY_LENGTH}.`
            : " "
        }
        sx={{ mt: 2 }}
      />

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          onClick={save}
          disabled={pending || stars === null || tooLong || unchanged}
        >
          {myReview ? "Update review" : "Post review"}
        </Button>
        {myReview ? (
          <Button color="inherit" onClick={withdraw} disabled={pending}>
            Remove
          </Button>
        ) : null}
        {stars === null ? (
          <Typography variant="caption" color="text.secondary">
            Pick a star rating to post.
          </Typography>
        ) : null}
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

function ReviewRow({
  review,
  householdId,
}: {
  review: ReviewWithAuthor;
  householdId: string;
}) {
  const { householdId: fromId, householdName: fromName } = review.author;
  const fromElsewhere = fromId !== null && fromId !== householdId;

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
        {review.author.name.trim().charAt(0).toUpperCase() || "?"}
      </Avatar>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {review.author.name}
          </Typography>
          <Rating
            value={review.stars}
            max={MAX_STARS}
            size="small"
            readOnly
            aria-label={`${review.stars} out of ${MAX_STARS} stars`}
          />
          {/*
           * The server renders in UTC and the reader is in New England, so
           * near midnight the two disagree about the date. React is told to
           * expect that and keep the client's answer, which is the right one.
           */}
          <Typography
            variant="caption"
            color="text.secondary"
            component="time"
            dateTime={new Date(review.createdAt).toISOString()}
            suppressHydrationWarning
          >
            {formatWhen(review.createdAt)}
          </Typography>
        </Stack>

        {review.body ? (
          // Preserve the line breaks someone typed. A review listing three
          // changes on three lines should not collapse into one paragraph.
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
            {review.body}
          </Typography>
        ) : null}

        {fromElsewhere ? (
          <Box sx={{ mt: 0.5 }}>
            <ReportOrHide
              target={{ reviewId: review.id }}
              household={{ id: fromId, name: fromName ?? "this household" }}
              what="review"
            />
          </Box>
        ) : null}
      </Box>
    </Stack>
  );
}

function formatWhen(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
