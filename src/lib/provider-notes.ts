/**
 * One note per thing worth saying, rather than one per provider.
 *
 * Written for Amazon Fresh and Whole Foods, two storefronts of one Amazon
 * that carried the same sentence - Amazon has no public ordering API. They
 * have since been removed, but the rule stands for any two shops that would
 * say the same thing: as two full paragraphs of serif it reads as a mistake.
 *
 * Grouping rather than rewriting, because the sentence is true of both and the
 * honest fix is to say it once. Inventing a difference between them to fill
 * two notes would be writing copy to suit a layout.
 *
 * Import-free and structurally typed, for the reason `recipe-meta.ts` gives:
 * the planner is a client component, and importing a value from anything that
 * touches Prisma pulls the Postgres driver into the browser bundle.
 */

export type NoteSource = {
  id: string;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
};

export type ProviderNote = {
  /** Stable across renders: the ids that share this note, joined. */
  key: string;
  /** "Amazon Fresh and Whole Foods". */
  subject: string;
  body: string;
};

/** "A", "A and B", "A, B and C". */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Providers whose note would read identically, collapsed into one.
 *
 * Order is preserved: the first provider to say a thing decides where the note
 * appears, so the row of buttons and the notes below it stay in step.
 *
 * A provider that cannot be used says so, and that sentence is part of what
 * makes a note distinct - two providers are only saying the same thing if they
 * are both unavailable for the same reason, or both fine.
 */
export function providerNotes(providers: NoteSource[]): ProviderNote[] {
  const order: string[] = [];
  const byBody = new Map<string, NoteSource[]>();

  for (const provider of providers) {
    const body = provider.available
      ? provider.description
      : `${provider.description} ${provider.unavailableReason ?? ""}`.trim();

    if (!byBody.has(body)) {
      byBody.set(body, []);
      order.push(body);
    }
    byBody.get(body)!.push(provider);
  }

  return order.map((body) => {
    const group = byBody.get(body)!;
    return {
      key: group.map((p) => p.id).join("+"),
      subject: joinLabels(group.map((p) => p.label)),
      body,
    };
  });
}
