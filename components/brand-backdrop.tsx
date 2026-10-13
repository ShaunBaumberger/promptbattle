/** Ambient violet → magenta glow behind the dark game screens (same mesh as the homepage). */
export function BrandBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_45%_at_15%_0%,rgba(123,92,255,0.35),transparent_70%),radial-gradient(45%_40%_at_95%_100%,rgba(236,72,189,0.22),transparent_70%)]"
    />
  );
}
