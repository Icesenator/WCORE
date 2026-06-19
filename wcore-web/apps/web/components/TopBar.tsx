"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ConnectButton } from "@/components/ConnectButton";

const GmWithdrawNotification = dynamic(() => import("@/components/GmWithdrawNotification").then(m => ({ default: m.GmWithdrawNotification })), { ssr: false });
import { GmButton } from "@/components/GmButton";
import { NotificationsBell } from "@/app/profile/components/NotificationsBell";
import { SettingsBar } from "@/components/SettingsBar";

interface TopBarProps {
  title?: string;
  onMenuToggle?: () => void;
}

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-12 px-4 border-b border-border bg-card/90 backdrop-blur-sm overflow-visible">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuToggle}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-fg transition sm:hidden"
        >
          <span className="flex flex-col gap-1" aria-hidden="true">
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
          </span>
        </button>
        {title ? (
          <p className="text-sm font-medium text-muted truncate">{title}</p>
        ) : (
          <p className="text-sm font-semibold text-fg sm:hidden">WCORE</p>
        )}
      </div>

      <div className="hidden items-center gap-2 shrink-0 sm:flex">
        <NotificationsBell />
        <GmWithdrawNotification />
        <GmButton />
        <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-accent transition">𝕏</a>
        <SettingsBar />
        <ConnectButton />
      </div>

      <div ref={mobileMenuRef} className="relative flex items-center gap-2 shrink-0 sm:hidden">
        <button
          type="button"
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-fg transition"
        >
          <span aria-hidden="true" className="text-lg leading-none">...</span>
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-12 z-40 flex w-56 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
            <NotificationsBell />
            <GmWithdrawNotification />
            <GmButton />
            <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-accent transition">𝕏</a>
            <SettingsBar />
            <ConnectButton />
          </div>
        ) : null}
      </div>
    </header>
  );
}
