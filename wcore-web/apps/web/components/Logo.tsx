export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      suppressHydrationWarning
    >
      {/* Main hexagon */}
      <path
        d="M32 8L54 20.5V45.5L32 58L10 45.5V20.5L32 8Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        className="text-accent"
        fill="none"
      />

      {/* Center */}
      <circle cx="32" cy="33" r="5" fill="currentColor" className="text-accent" />

      {/* Inner connections — all same length (13px) */}
      <path
        d="M32 33L32 20M32 33L21 40M32 33L43 40"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-accent"
      />

      {/* Orbital nodes — symmetric at ~120°, same distance from center */}
      <circle cx="32" cy="20" r="3.5" fill="currentColor" className="text-accent" />
      <circle cx="21" cy="40" r="3.5" fill="currentColor" className="text-accent" />
      <circle cx="43" cy="40" r="3.5" fill="currentColor" className="text-accent" />

      {/* Outer connection lines */}
      <path
        d="M32 20L32 8M21 40L10 46M43 40L54 46"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-accent/60"
      />

      {/* Outer nodes */}
      <circle cx="32" cy="8" r="2.5" fill="currentColor" className="text-accent/50" />
      <circle cx="10" cy="46" r="2.5" fill="currentColor" className="text-accent/50" />
      <circle cx="54" cy="46" r="2.5" fill="currentColor" className="text-accent/50" />
    </svg>
  );
}
