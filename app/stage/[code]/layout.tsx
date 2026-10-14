import type { ReactNode } from "react";
import { BrandBackdrop } from "@/components/brand-backdrop";

/**
 * Projector-side dark theme. The ambient gradient gives the room a
 * cinematic backdrop without distracting from the content overlays.
 */
export default function StageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      <BrandBackdrop />
      {children}
    </div>
  );
}
