"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isBareBubblesRoute } from "@/lib/bare-routes";

export default function NotFound() {
  // Une variante de casse d'une page cadrable (ex. /CMC/crypto/bubbles/EMBED) renvoie cette 404 avec l'exception de
  // cadrage : pas de lien, pour qu'aucune navigation ne charge une page protegee dans le cadre tiers.
  const bare = isBareBubblesRoute(usePathname());
  return (
    <main className="flex min-h-[60vh] w-full items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-6xl font-bold text-accent">404</h2>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted">
          The page you are looking for does not exist or has been moved.
        </p>
        {bare ? null : (
          <div className="flex justify-center gap-3">
            <Link
              href="/"
              className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/30"
            >
              Go home
            </Link>
            <Link
              href="/profile"
              className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-fg transition hover:bg-border"
            >
              Profile
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
