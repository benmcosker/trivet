import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { CopyAddress } from "@/components/CopyAddress";
import { APP_NAME } from "@/lib/legal";
import { mcpResource } from "@/lib/mcp/resource";
import { fonts } from "@/theme/theme";

export const metadata: Metadata = {
  title: `Connect an assistant — ${APP_NAME}`,
  description: `How to connect Claude, or another AI assistant, to ${APP_NAME}.`,
};

/**
 * How to connect an AI assistant (MCP-PLAN.md, phase 4), as drawn on the
 * assistants board (https://claude.ai/artifact/GroZmtNXWFLMiFvP7jNn6b).
 *
 * Public, like the policy pages: no session check, so someone can read it
 * before they have been invited. Linked from the footer, the Household
 * page's Connected assistants card and the consent screen.
 */

const CLAUDE_STEPS: ReactNode[] = [
  <>
    On claude.ai or in the Claude desktop app, open <strong>Settings</strong>,
    then <strong>Connectors</strong>.
  </>,
  <>
    Choose <strong>Add custom connector</strong>. Call it Trivet and paste the
    address above.
  </>,
  <>
    Choose <strong>Connect</strong>. Trivet&apos;s sign-in opens; sign in as you
    always do.
  </>,
  <>
    Choose what it may do, then <strong>Connect</strong> again. That&apos;s it.
  </>,
];

/**
 * From OpenAI's own guide to adding a custom MCP server
 * (developers.openai.com/api/docs/guides/custom-mcp-server). ChatGPT signs in
 * with a Client ID Metadata Document or dynamic registration, both of which
 * Trivet accepts.
 */
const CHATGPT_STEPS: ReactNode[] = [
  <>
    In ChatGPT on the web, open <strong>Plugins</strong> and choose{" "}
    <strong>+</strong>, then <strong>Add custom MCP server</strong>.
  </>,
  <>
    Call it Trivet, paste the address above, choose <strong>OAuth</strong>, then{" "}
    <strong>Create</strong>.
  </>,
  <>Trivet&apos;s sign-in opens; sign in as you always do.</>,
  <>
    Choose what it may do, then <strong>Connect</strong>. That&apos;s it.
  </>,
];

const ASKS = [
  "What can I make with the grouper I bought?",
  "What's on this week, and what do I still need to buy?",
  "Suggest dinners for next week, nothing over 45 minutes on weeknights.",
  "Add dish soap and two litres of milk to the list.",
];

const LOOK = [
  "Search and read your recipes",
  "See the week and the list",
  "See the pantry",
  "Suggest dinners",
];
const PLAN = ["Put dinners on days", "Add to the pantry", "Add to the list"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      sx={{ display: "flex", flexDirection: "column", gap: 2.25 }}
    >
      <Typography variant="h2" sx={{ fontWeight: 400 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <Box
      component="ol"
      sx={{
        m: 0,
        p: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {steps.map((step, index) => (
        <Box component="li" key={index} sx={{ display: "flex", gap: 2 }}>
          <Typography
            component="span"
            sx={{
              flex: "0 0 24px",
              fontFamily: fonts.sans,
              fontWeight: 700,
              fontSize: 14,
              color: "primary.main",
              pt: "3px",
            }}
          >
            {index + 1}
          </Typography>
          <Typography component="span" sx={{ lineHeight: 1.55 }}>
            {step}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
      {items.map((item) => (
        <Typography component="li" key={item} sx={{ lineHeight: 1.6 }}>
          {item}
        </Typography>
      ))}
    </Box>
  );
}

export default function AssistantsPage() {
  return (
    <AppShell>
      <Typography variant="overline" color="secondary" component="p">
        Help
      </Typography>
      <Typography variant="h1" sx={{ mt: 1 }}>
        Connect an assistant
      </Typography>
      <Typography
        variant="subtitle1"
        sx={{ mt: 3, maxWidth: 640, fontStyle: "normal" }}
      >
        Connect Claude, ChatGPT or another AI assistant to your {APP_NAME} once.
        Then ask it about your recipes, your week and your shopping list in
        plain words. It answers from your recipe box, not the internet&apos;s.
      </Typography>

      <Box
        sx={{
          mt: 5,
          maxWidth: 720,
          bgcolor: "background.raised",
          p: { xs: 2.25, sm: 3.5 },
          display: "flex",
          flexDirection: "column",
          gap: 1.75,
        }}
      >
        <Typography variant="overline" component="p" color="text.muted">
          {APP_NAME}&apos;s address for assistants
        </Typography>
        <CopyAddress address={mcpResource()} />
      </Box>

      <Box
        sx={{
          mt: { xs: 6, sm: 10 },
          pt: { xs: 4, sm: 7 },
          borderTop: 1,
          borderColor: "divider",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          gap: { xs: "48px", md: "56px 72px" },
        }}
      >
        <Section title="In Claude">
          <Steps steps={CLAUDE_STEPS} />
          <Typography variant="body2" color="text.muted" sx={{ maxWidth: 480 }}>
            Added on the web or desktop, it shows in the Claude iPhone app too.
            In a chat, check {APP_NAME} is switched on in the menu under{" "}
            <strong>+</strong>.
          </Typography>
        </Section>

        <Section title="In ChatGPT">
          <Steps steps={CHATGPT_STEPS} />
          <Typography variant="body2" color="text.muted" sx={{ maxWidth: 480 }}>
            Custom servers depend on your ChatGPT plan, and some plans need
            Developer mode switched on in Settings first. Added on the web, it
            shows in the ChatGPT app too.
          </Typography>
        </Section>

        <Section title="Things to ask">
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {ASKS.map((ask, index) => (
              <Typography
                key={ask}
                sx={{
                  fontStyle: "italic",
                  fontSize: { xs: "1.1875rem", sm: "1.3125rem" },
                  lineHeight: 1.4,
                  color: "text.soft",
                  py: 1.5,
                  borderBottom: index < ASKS.length - 1 ? "1px dashed" : 0,
                  borderColor: "dividerDashed",
                }}
              >
                “{ask}”
              </Typography>
            ))}
          </Box>
        </Section>

        <Section title="What it can do">
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
              },
              gap: 3.5,
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Typography variant="overline" component="p" color="text.muted">
                Look · always
              </Typography>
              <List items={LOOK} />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Typography variant="overline" component="p" color="primary">
                Plan · if you allow it
              </Typography>
              <List items={PLAN} />
            </Box>
          </Box>
          <Typography sx={{ color: "text.soft" }}>
            It never deletes a recipe, changes your household, saves a recipe
            without your review, or texts anyone. Whatever it plans shows in{" "}
            {APP_NAME} for you to undo.
          </Typography>
        </Section>

        <Section title="Disconnecting">
          <Typography>
            On the <Link href="/household">Household</Link> page, under
            Connected assistants, choose <strong>Disconnect</strong>. The next
            thing it asks for is refused.
          </Typography>
          <Typography>
            Connected to look only, and want it to plan? Disconnect it, connect
            again, and tick <strong>Also let it plan</strong>.
          </Typography>
        </Section>

        <Section title="Other assistants">
          <Typography>
            Any assistant that supports remote MCP connectors with sign-in can
            use the same address. In Claude Code:
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              bgcolor: "#1a1815",
              color: "#f4efe4",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            claude mcp add --transport http trivet {mcpResource()}
          </Box>
        </Section>
      </Box>
    </AppShell>
  );
}
