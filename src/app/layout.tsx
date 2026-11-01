import type { Metadata } from "next";
import localFont from "next/font/local";

import { Providers } from "@/theme/Providers";

/**
 * Two faces, split by job. Newsreader carries the food - dish titles,
 * ingredients, method steps, prose - and Karla carries the machinery - nav,
 * buttons, labels, quantities. The 300 italic is load-bearing rather than
 * decorative: it sets the second half of a two-part title ("Zuni Chicken
 * *with Bread Salad*"), so the italic face is loaded here instead of being
 * left to a synthesised oblique.
 *
 * Served from this app rather than fetched from Google at build time. The
 * build used to download them through `next/font/google`, and once Google's
 * response to GitHub's runners changed, every CI build failed inside the
 * font loader before a line of our own code ran. Variable files from
 * Fontsource (Latin only, OFL - licences beside them in ./fonts) cover every
 * weight the app uses, 300 to 700, in three files.
 */
const newsreader = localFont({
  src: [
    {
      path: "./fonts/newsreader-latin-wght-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "./fonts/newsreader-latin-wght-italic.woff2",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

const karla = localFont({
  src: [
    {
      path: "./fonts/karla-latin-wght-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
  ],
  variable: "--font-karla",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trivet",
  description:
    "Recipe box, weekly meal planner and grocery list for one household.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${karla.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
