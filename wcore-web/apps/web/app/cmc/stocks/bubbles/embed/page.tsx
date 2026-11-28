import { BubblesClient } from "../../../BubblesClient";

export const metadata = { title: "Stock Bubbles | WCORE" };

// Variante integrable (iframe) de la fenetre Stock Bubbles : meme affichage que la popup, servie avec
// un frame-ancestors limite (voir next.config.mjs). Page publique, aucune donnee personnelle.
export default function CmcStocksBubblesEmbedPage() {
  return <BubblesClient endpoint="/api/cmc/stocks" title="Stock Bubbles" kind="stock" tablePath="/cmc/stocks" popup />;
}
