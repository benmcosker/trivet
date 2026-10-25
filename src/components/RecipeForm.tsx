"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";

import { formatQuantity, parseQuantity } from "@/lib/quantity";
import {
  MACRO_KEYS,
  MACRO_RANGE,
  TEMPERATURE_UNITS,
  type MacroKey,
  type RecipeInput,
} from "@/lib/recipe-schema";

export type RecipeFormValues = RecipeInput;

type Row = { name: string; quantity: string; unit: string; note: string };

function toRows(ingredients: RecipeInput["ingredients"]): Row[] {
  if (ingredients.length === 0)
    return [{ name: "", quantity: "", unit: "", note: "" }];
  return ingredients.map((i) => ({
    name: i.name,
    quantity: formatQuantity(i.quantity ?? null),
    unit: i.unit ?? "",
    note: i.note ?? "",
  }));
}

export function RecipeForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: RecipeFormValues;
  submitLabel: string;
  onSubmit: (
    values: RecipeFormValues,
  ) => Promise<{ ok: false; error: string } | void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [servings, setServings] = useState(String(initial.servings ?? 4));
  const [prepMinutes, setPrepMinutes] = useState(
    initial.prepMinutes == null ? "" : String(initial.prepMinutes),
  );
  const [cookMinutes, setCookMinutes] = useState(
    initial.cookMinutes == null ? "" : String(initial.cookMinutes),
  );
  const [restMinutes, setRestMinutes] = useState(
    initial.restMinutes == null ? "" : String(initial.restMinutes),
  );
  const [ovenTemp, setOvenTemp] = useState(
    initial.ovenTemp == null ? "" : String(initial.ovenTemp),
  );
  const [ovenTempUnit, setOvenTempUnit] = useState(
    initial.ovenTempUnit ?? "FAHRENHEIT",
  );
  const [yieldNote, setYieldNote] = useState(initial.yieldNote ?? "");
  /** The four macros as numbers, or nulls where the field was left empty. */
  function macroFields() {
    return Object.fromEntries(
      MACRO_KEYS.map((key) => [
        key,
        macros[key] === "" ? null : Number(macros[key]),
      ]),
    ) as Record<MacroKey, number | null>;
  }

  const [macros, setMacros] = useState<Record<MacroKey, string>>(
    () =>
      Object.fromEntries(
        MACRO_KEYS.map((key) => [
          key,
          initial[key] == null ? "" : String(initial[key]),
        ]),
      ) as Record<MacroKey, string>,
  );
  const [equipment, setEquipment] = useState<string[]>(initial.equipment);
  const [equipmentDraft, setEquipmentDraft] = useState("");
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl ?? "");
  const [sourceName, setSourceName] = useState(initial.sourceName ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [rows, setRows] = useState<Row[]>(toRows(initial.ingredients));
  const [steps, setSteps] = useState<string[]>(
    initial.instructions.length > 0 ? initial.instructions : [""],
  );
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quantityIssues, setQuantityIssues] = useState<Map<number, string>>(
    new Map(),
  );
  const [busy, setBusy] = useState(false);

  function addEquipment() {
    const value = equipmentDraft.trim();
    if (!value) return;
    if (!equipment.some((e) => e.toLowerCase() === value.toLowerCase())) {
      setEquipment([...equipment, value]);
    }
    setEquipmentDraft("");
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!value) return;
    if (!tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setTags([...tags, value]);
    }
    setTagDraft("");
  }

  /**
   * Which rows have an unreadable quantity, by index.
   *
   * Checked here rather than left to the schema: a NaN reaching Zod is
   * reported as a type error on the whole form, which is true and useless -
   * it does not say which of eleven ingredients it means.
   */
  function quantityErrors(current: Row[]): Map<number, string> {
    const errors = new Map<number, string>();
    current.forEach((row, index) => {
      if (!row.name.trim()) return;
      const parsed = parseQuantity(row.quantity);
      if (!parsed.ok) errors.set(index, parsed.reason);
    });
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const named = rows.filter((r) => r.name.trim());
    const badQuantities = quantityErrors(rows);
    if (badQuantities.size > 0) {
      // Marked on the fields themselves; the banner only says how many, since
      // the reason is already sitting under each one.
      setQuantityIssues(badQuantities);
      setError(
        badQuantities.size === 1
          ? "One ingredient has a quantity that cannot be read."
          : `${badQuantities.size} ingredients have quantities that cannot be read.`,
      );
      return;
    }
    setQuantityIssues(new Map());
    setBusy(true);

    const values: RecipeFormValues = {
      title,
      description: description || null,
      servings: Number(servings) || 4,
      prepMinutes: prepMinutes === "" ? null : Number(prepMinutes),
      cookMinutes: cookMinutes === "" ? null : Number(cookMinutes),
      restMinutes: restMinutes === "" ? null : Number(restMinutes),
      // The unit only means something with a number beside it, so an empty
      // temperature clears both rather than leaving a stray unit behind.
      ovenTemp: ovenTemp === "" ? null : Number(ovenTemp),
      ovenTempUnit: ovenTemp === "" ? null : ovenTempUnit,
      yieldNote: yieldNote || null,
      ...macroFields(),
      equipment,
      sourceUrl: sourceUrl || null,
      sourceName: sourceName || null,
      notes: notes || null,
      instructions: steps.map((s) => s.trim()).filter(Boolean),
      ingredients: named.map((r) => ({
        name: r.name.trim(),
        // Already validated above, so this cannot fail here.
        quantity: (parseQuantity(r.quantity) as { value: number | null }).value,
        unit: r.unit || null,
        note: r.note || null,
      })),
      tags,
    };

    const result = await onSubmit(values);
    if (result && result.ok === false) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label="Servings"
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label="Prep (min)"
                  type="number"
                  value={prepMinutes}
                  onChange={(e) => setPrepMinutes(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label="Cook (min)"
                  type="number"
                  value={cookMinutes}
                  onChange={(e) => setCookMinutes(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label="Rest / chill (min)"
                  type="number"
                  value={restMinutes}
                  onChange={(e) => setRestMinutes(e.target.value)}
                  helperText="Resting, marinating, proving"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label="Oven temp"
                  type="number"
                  value={ovenTemp}
                  onChange={(e) => setOvenTemp(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  select
                  label="Unit"
                  value={ovenTempUnit}
                  onChange={(e) =>
                    setOvenTempUnit(
                      e.target.value as (typeof TEMPERATURE_UNITS)[number],
                    )
                  }
                  // Meaningless on its own, so it stays out of the way until
                  // there is a number for it to describe.
                  disabled={ovenTemp === ""}
                  fullWidth
                >
                  {TEMPERATURE_UNITS.map((unit) => (
                    <MenuItem key={unit} value={unit}>
                      {unit === "FAHRENHEIT" ? "°F" : "°C"}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Yield"
                  value={yieldNote}
                  onChange={(e) => setYieldNote(e.target.value)}
                  placeholder="Makes 12 muffins"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Source name"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Bon Appetit"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Source URL"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  fullWidth
                />
              </Grid>
              {MACRO_KEYS.map((key) => (
                <Grid size={{ xs: 6, sm: 3 }} key={key}>
                  <TextField
                    label={MACRO_RANGE[key].label}
                    type="number"
                    value={macros[key]}
                    onChange={(e) =>
                      setMacros((m) => ({ ...m, [key]: e.target.value }))
                    }
                    helperText={
                      key === "caloriesKcal"
                        ? "Per serving, kcal"
                        : "Per serving, g"
                    }
                    fullWidth
                  />
                </Grid>
              ))}
            </Grid>

            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField
                  label="Equipment"
                  value={equipmentDraft}
                  onChange={(e) => setEquipmentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // Otherwise Enter submits the whole recipe while someone
                      // is still adding pans.
                      e.preventDefault();
                      addEquipment();
                    }
                  }}
                  placeholder="9x13 baking dish"
                  size="small"
                  fullWidth
                />
                <Button
                  aria-label="Add equipment"
                  onClick={addEquipment}
                  disabled={!equipmentDraft.trim()}
                >
                  Add
                </Button>
              </Stack>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                {equipment.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    size="small"
                    onDelete={() =>
                      setEquipment(equipment.filter((e) => e !== item))
                    }
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h3" gutterBottom>
            Ingredients
          </Typography>
          <Stack spacing={1.5}>
            {rows.map((row, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={1}
                sx={{ alignItems: "center" }}
              >
                <TextField
                  label="Qty"
                  value={row.quantity}
                  onChange={(e) => {
                    updateRow(index, { quantity: e.target.value });
                    // Cleared as soon as they start fixing it, rather than
                    // staying red until the next failed submit.
                    if (quantityIssues.has(index)) {
                      const next = new Map(quantityIssues);
                      next.delete(index);
                      setQuantityIssues(next);
                    }
                  }}
                  error={quantityIssues.has(index)}
                  helperText={quantityIssues.get(index) ?? ""}
                  placeholder="1 1/2"
                  sx={{ width: 90 }}
                />
                <TextField
                  label="Unit"
                  value={row.unit}
                  onChange={(e) => updateRow(index, { unit: e.target.value })}
                  sx={{ width: 110 }}
                />
                <TextField
                  label="Ingredient"
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  fullWidth
                />
                <IconButton
                  aria-label={`Remove ingredient ${index + 1}`}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  disabled={rows.length === 1}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                startIcon={<AddIcon />}
                onClick={() =>
                  setRows([
                    ...rows,
                    { name: "", quantity: "", unit: "", note: "" },
                  ])
                }
              >
                Add ingredient
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h3" gutterBottom>
            Method
          </Typography>
          <Stack spacing={1.5}>
            {steps.map((step, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={1}
                sx={{ alignItems: "flex-start" }}
              >
                <Typography
                  sx={{ pt: 1.5, minWidth: 24 }}
                  color="text.secondary"
                >
                  {index + 1}.
                </Typography>
                <TextField
                  // The visible "1." beside it is a Typography, not a label,
                  // so without this a screen reader reaches an unnamed box.
                  // It has to go through slotProps: TextField spreads unknown
                  // props onto the wrapper, where aria-label does nothing.
                  slotProps={{
                    htmlInput: { "aria-label": `Step ${index + 1}` },
                  }}
                  value={step}
                  onChange={(e) =>
                    setSteps(
                      steps.map((s, i) => (i === index ? e.target.value : s)),
                    )
                  }
                  multiline
                  fullWidth
                />
                <IconButton
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                  disabled={steps.length === 1}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                startIcon={<AddIcon />}
                onClick={() => setSteps([...steps, ""])}
              >
                Add step
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h3" gutterBottom>
            Tags
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap", gap: 1, mb: 2 }}
          >
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                onDelete={() => setTags(tags.filter((t) => t !== tag))}
              />
            ))}
            {tags.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No tags yet.
              </Typography>
            ) : null}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Add a tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button aria-label="Add tag" onClick={addTag}>
              Add
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        </CardContent>
      </Card>

      <Box>
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </Box>
    </Stack>
  );

  function updateRow(index: number, patch: Partial<Row>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
}
