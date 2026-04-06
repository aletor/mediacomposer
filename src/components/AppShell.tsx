"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Full-viewport shell: composer canvas without marketing sidebar/topbar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSpaces =
    pathname === "/spaces" || pathname?.startsWith("/spaces/");

  if (isSpaces) {
    return (
      <main className="h-screen w-screen overflow-hidden">{children}</main>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">{children}</div>
  );
}
