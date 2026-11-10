import { BubblesClient } from "../../../BubblesClient";

export const metadata = { title: "Stock Bubbles | WCORE" };

export default function CmcStocksBubblesPopupPage() {
  return <BubblesClient endpoint="/api/cmc/stocks" title="Stock Bubbles" kind="stock" tablePath="/cmc/stocks" popup />;
}
