"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A Button that navigates.
 *
 * MUI's `component={Link}` passes a component function as a prop, which a
 * server component cannot send across the RSC boundary - it typechecks and
 * builds, then fails at request time. Doing it inside a client component keeps
 * that prop on one side of the boundary, so server pages can link freely.
 */
export function LinkButton({
  href,
  transitionTypes,
  children,
  ...buttonProps
}: {
  href: string;
  /** For `PageTransition`: `nav-back` slides the page the way back. */
  transitionTypes?: string[];
  children: ReactNode;
} & Omit<ButtonProps, "href">) {
  return (
    <Button
      component={Link}
      href={href}
      transitionTypes={transitionTypes}
      {...buttonProps}
    >
      {children}
    </Button>
  );
}
