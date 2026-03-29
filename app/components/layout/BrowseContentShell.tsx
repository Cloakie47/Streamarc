import type { ReactNode } from "react";

/** Shared horizontal gutter + max width for Browse (filter row, hero inner, ad, shelves). */
export const BROWSE_SHELL_CLASS =
  "w-full max-w-[min(100%,1600px)] mx-auto px-8 sm:px-12 lg:px-16";

export default function BrowseContentShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${BROWSE_SHELL_CLASS} ${className}`.trim()}>{children}</div>;
}
