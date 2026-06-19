"use client";

import { Logo } from "./Logo";

export function LogoSpinner({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className="animate-spin-slow">
          <Logo className={`${className} text-accent/80`} />
        </div>
        <div className="absolute inset-0 animate-ping opacity-20">
          <Logo className={`${className} text-accent`} />
        </div>
      </div>
      <span className="text-xs text-muted animate-pulse">Loading WCORE...</span>
    </div>
  );
}
