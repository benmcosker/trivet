import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { APP_NAME } from "@/lib/legal";
import { PAGE_MAX_WIDTH, PAGE_PADDING_X } from "@/theme/page";

/**
 * The policy links, on every page including the ones nobody has signed in to.
 *
 * Not decoration. A carrier vetting the messaging campaign is told to look for
 * a privacy policy on the website that was registered, and the first thing
 * they see at the root of this one is a sign-in form: the policies existed at
 * their own URLs but nothing on the site led to them, which reads as a site
 * with no policy. Twilio's own example of a submission that passes describes
 * "a single, clearly labeled privacy policy linked from the opt-in page".
 *
 * So the links sit in the shell rather than on the pages that happen to need
 * them, which also means the signed-out sign-in page carries them - the one
 * page a reviewer is guaranteed to land on.
 *
 * Plain MUI Links with an href, never `component={Link}`: this renders inside
 * a server component, and a function crossing that boundary into MUI's client
 * code typechecks, builds, and then fails at render.
 */
export function SiteFooter() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        mt: "auto",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: PAGE_MAX_WIDTH,
          mx: "auto",
          px: PAGE_PADDING_X,
          py: 3,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 2.5,
          rowGap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {APP_NAME}
        </Typography>
        <Link href="/privacy" variant="body2">
          Privacy Policy
        </Link>
        <Link href="/terms" variant="body2">
          Terms of Service
        </Link>
        <Link href="/sms" variant="body2">
          Text messages
        </Link>
      </Box>
    </Box>
  );
}
