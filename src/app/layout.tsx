import type { Metadata } from "next";
import { Karla, Newsreader } from "next/font/google";

import { Providers } from "@/theme/Providers";

/**
 * Two faces, split by job. Newsreader carries the food - dish titles,
 * ingredients, method steps, prose - and Karla carries the machinery - nav,
 * buttons, labels, quantities. The 300 italic is load-bearing rather than
 * decorative: it sets the second half of a two-part title ("Zuni Chicken
 * *with Bread Salad*"), so the weight and the italic are both requested
 * here instead of being left to a synthesised oblique.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-newsreader",
});

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
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
