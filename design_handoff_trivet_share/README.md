# Trivet — share sheet, phase 2

A handoff for `benmcosker/trivet`. It draws the states Phase 2 of
`SHARE-SHEET-PLAN.md` names: screenshots, photos and PDFs shared to Trivet from
the iPhone share sheet, and the upload page they arrive on.

The requirement: **somebody who screenshots a TikTok caption can send it to
Trivet in one share, and sees that it was read before they leave the app they
were in.**

---

## 1. The decisions

Settled with Ben on 10 November.

1. **The sheet shows what it read.** Screenshots read on the phone show the
   first lines under *What it read*, so a caption that read as noise is
   caught before the trip to Trivet, not after.
2. **More than six images reach the sheet, which says why.** An activation
   rule capped at six would hide Trivet from the share sheet when seven are
   selected, with no reason given. The rule accepts any number and the sheet
   refuses past six (state 5).
3. **The section in use moves to the top of the upload page.** Some text is
   last on the card; arriving with shared words would otherwise mean reading
   off the bottom of the page. Starting any other section puts the usual
   order back, so the link section's handoff note ("bring that in below")
   stays true.
4. **Reading starts on arrival,** as a shared link already does. No extra tap.

### Considered and not chosen

**Reading the screenshots on the server, as photos.** It works today, but it
costs an image read per screenshot and sends the pictures. Read on the phone,
a caption is a few hundred words of text.

**Letting the person reorder screenshots in the sheet.** Share order is the
order they picked them in Photos, which is almost always reading order.

---

## 2. The states

All drawn at 390 × 844, the light scheme only. The sheet keeps Phase 1's
shape: the mark, a 32px serif heading over a 1px ink rule, one 18px serif
paragraph, a full-width Done.

### 1 · Reading screenshots

*Reading 2 images* · *Finding the words, here on your phone. Nothing has been
sent anywhere.* A determinate bar in `primary.main` (one step per image) over
the images, numbered in share order. No Done: leaving now would lose it.

### 2 · Screenshots read

*Ready for Trivet* · *The words from 2 screenshots are waiting. Open Trivet and
they will be read on the Add a recipe page.* Then *What it read*: Karla 700,
11px, `0.16em`, uppercase, `primary.main`, over the first lines run together
(about 160 characters), Newsreader italic 300, 15px, on `background.raised`
with hairlines, and *And 22 more lines* in 12px `text.secondary`.

Enough words means at least 6 lines, 120 characters and an average confidence
of 0.6 across the images. Below that, the images go to the photo import
instead (state 3).

### 3 · A photo of a card

*Your photo is waiting. Open Trivet and it will be read as a card…* With
several: *Your 3 photos are waiting… read as one recipe…* The photos are shown
as they will be sent: JPEGs, upright, at most 2,000 pixels.

### 4 · A PDF

*Your PDF is waiting…* over a row with the file's name (serif 18px, truncated
in the middle) and *PDF · 1.2 MB*.

### 5 · Refused

What the upload would refuse, said in the sheet so nobody waits for the trip
to the app to be told no.

| Case | Heading | Copy |
| --- | --- | --- |
| More than six images | Six at a time | Trivet reads up to six screenshots or photos as one recipe, and you picked 8. Share the six that hold the recipe. |
| A PDF over 20 MB | That file is too big | Trivet takes PDFs up to 20 MB, and this one is 34 MB. A screenshot of each page will go through. |
| A PDF with photos, or two PDFs | One kind at a time | Share one PDF on its own, or up to six screenshots and photos. |

Photos are never too big: the sheet shrinks them first.

### 6 · Arriving with the words · 7 · Arriving with a photo or PDF

The upload page, opened by the app at `/upload?shared=1`. Under the page's
heading, a status band in the offline designs' device: `background.raised`,
hairlines above and below, an 18px stroke share glyph, then

- Karla 700, 11px, `0.14em`, uppercase, `text.primary`:
  *Shared to Trivet · 2 screenshots* (*· Some text*, *· 1 photo*,
  *· 3 photos*, *· 1 PDF*);
- Newsreader italic 300, 15px, `text.muted`: *Read on your phone. Trivet is
  turning the words into a recipe.* (*Trivet is turning it into a recipe.*,
  *Trivet is reading the photo.*, *…reading them as one recipe.*, *Trivet is
  reading it now.*)

It is a `role="status"` region and shows only while that item is being read.
The section in use comes first on the card, filled in, with its usual button
counting the seconds and the progress bar under it.

---

## 3. Elsewhere in the sheet

Phase 1's copy changes where Phase 2 makes it untrue:

- **TikTok or Instagram link:** *…Take screenshots of the caption and share
  those to Trivet.*
- **Nothing to read:** *Nothing to read in that* · *Share the recipe page
  itself, screenshots of the recipe, or its text.* A note or a message with a
  recipe in it is now read as text, not refused.
- **Failed:** *Trivet couldn't keep that. Try sharing it again, or add it in
  Trivet under Upload.*

## Files

`01`–`07` are the Claude Design artboards (`.dc.html`, opened with
`support.js` beside them), in the order above.
