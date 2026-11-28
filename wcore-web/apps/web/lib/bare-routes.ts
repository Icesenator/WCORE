// Routes affichees SANS l'habillage du site (menu, notifications, session) : fenetres Bubbles detachees (popup)
// et variantes integrables (embed, cadrables par Apps Script, voir security-headers.mjs). Comparaison insensible
// a la casse : Next.js applique les en-tetes avant de resoudre la casse, une variante de casse de /embed est donc
// cadrable et ne doit jamais afficher le menu ni les notifications.
export function isBareBubblesRoute(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").toLowerCase();
  return p.endsWith("/bubbles/popup") || p.endsWith("/bubbles/embed");
}