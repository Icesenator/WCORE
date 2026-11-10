import { BubblesClient } from "../../BubblesClient";

export const metadata = { title: "Stock Bubbles | WCORE" };

export default function CmcStockBubblesPage() {
  return <BubblesClient endpoint="/api/cmc/stocks" title="Stock Bubbles" kind="stock" tablePath="/cmc/stocks" popupPath="/cmc/stocks/bubbles/popup" />;
}
