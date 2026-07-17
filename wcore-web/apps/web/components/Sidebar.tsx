"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const icons = {
  home: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  user: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  flame: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  clipboard: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h6"/></svg>,
  trophy: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7.67 2 12 2c4.33 0 5 2 7.5 2a2.5 2.5 0 0 1 0 5H18"/><path d="M18.2 4A3 3 0 0 1 21 7H6.5a2.5 2.5 0 0 1 0-5h10.7"/><path d="M12 22v-7"/><path d="M12 2v7"/><path d="M6 9v2a6 6 0 0 0 12 0V9"/></svg>,
  messages: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  info: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
  table: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/></svg>,
};

const NAV_LINKS = [
  { href: "/", label: "Home", icon: "home" as const },
  { href: "/profile", label: "Profile", icon: "user" as const },
  { href: "/gm", label: "GM", icon: "flame" as const },
  { href: "/history", label: "History", icon: "clipboard" as const },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" as const },
  { href: "/support", label: "Support", icon: "messages" as const },
  { href: "/about", label: "About", icon: "info" as const },
  { href: "/cmc/crypto", label: "Market Cap Crypto", icon: "table" as const },
  { href: "/cmc/stocks", label: "Market Cap Stock", icon: "table" as const },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  mobileOpen?: boolean;
}

export function Sidebar({ collapsed, onToggle, onClose, mobileOpen = false }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "[" && e.ctrlKey) {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onToggle]);

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[200px] flex-col border-r border-border bg-card transition-all duration-300 -translate-x-full sm:translate-x-0 ${mobileOpen ? "translate-x-0" : ""} ${collapsed ? "sm:w-[56px]" : "sm:w-[200px]"}`}>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-fg transition sm:hidden"
      >
        x
      </button>
      <Link
        href="/"
        className={`flex items-center border-b border-border group transition-all duration-300 h-12 gap-2 px-4 ${collapsed ? "sm:justify-center sm:gap-0 sm:px-0" : "sm:gap-2 sm:px-4"}`}
      >
        <Logo className="h-6 w-6 text-accent transition group-hover:scale-105 shrink-0" />
        <span className={`text-base font-bold tracking-tight whitespace-nowrap overflow-hidden ${collapsed ? "sm:hidden" : ""}`}>WCORE</span>
      </Link>

      <nav className={`flex-1 overflow-y-auto py-3 transition-all duration-300 px-2 ${collapsed ? "sm:px-1" : "sm:px-2"}`}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={collapsed ? link.label : undefined}
            onClick={onClose}
            className={`flex items-center rounded-lg text-sm font-medium transition my-0.5 gap-2.5 px-3 py-2 ${
              collapsed
                ? "sm:justify-center sm:gap-0 sm:px-0 sm:py-2.5"
                : "sm:gap-2.5 sm:px-3 sm:py-2"
            } ${
              pathname === link.href
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-fg hover:bg-bg"
            }`}
          >
            <span className="text-base shrink-0">{icons[link.icon]}</span>
            <span className={`whitespace-nowrap overflow-hidden ${collapsed ? "sm:hidden" : ""}`}>{link.label}</span>
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden sm:flex items-center justify-center w-full py-3 border-t border-border text-xs text-muted hover:text-fg hover:bg-bg transition shrink-0"
      >
        <span className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>◀</span>
        {!collapsed ? <span className="ml-2 text-[10px] text-muted/50">Ctrl+[</span> : null}
      </button>
    </aside>
  );
}
