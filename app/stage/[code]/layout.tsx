import type { ReactNode } from "react";

/**
 * Projector-side dark theme. The ambient gradient gives the room a
 * cinematic backdrop without distracting from the content overlays.
 */
export default function StageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(217,119,6,0.12),transparent_60%)]"
      />
      {children}
    </div>
  );
}
