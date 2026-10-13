import type { ReactNode } from "react";
import { BrandBackdrop } from "@/components/brand-backdrop";

/**
 * Player-side brand theme: indigo canvas with the violet/magenta glow;
 * descendant cards layer translucent surfaces on top.
 */
export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      <BrandBackdrop />
      {children}
    </div>
  );
}
