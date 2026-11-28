import { BubblesClient } from "../../../BubblesClient";

export const metadata = { title: "Crypto Bubbles | WCORE" };

// Variante integrable (iframe) de la fenetre Crypto Bubbles : meme affichage que la popup, servie avec
// un frame-ancestors limite (voir next.config.mjs). Page publique, aucune donnee personnelle.
export default function CmcCryptoBubblesEmbedPage() {
  return <BubblesClient endpoint="/api/cmc/crypto" title="Crypto Bubbles" kind="crypto" tablePath="/cmc/crypto" popup />;
}
