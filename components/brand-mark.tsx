/** Logo mark: two overlapping prompt tiles — player A (green) vs player B (magenta). */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.5" y="4" width="18" height="18" rx="5.5" fill="#35ed7e" />
      <rect x="12.5" y="10" width="18" height="18" rx="5.5" fill="#ec48bd" />
      <path d="M12.5 15.5a5.5 5.5 0 0 1 5.5-5.5h1.5v6.5a5.5 5.5 0 0 1-5.5 5.5h-1.5z" fill="#7b5cff" />
    </svg>
  );
}
