import type { ReactNode } from "react";

/**
 * Player-side dark theme. Adopts an Apple-style glass/depth aesthetic via
 * a deep backdrop gradient and lets descendant cards layer translucent
 * surfaces on top.
 */
export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Subtle ambient gradient — adds depth without overpowering content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.12),transparent_60%)]"
      />
      {children}
    </div>
  );
}
