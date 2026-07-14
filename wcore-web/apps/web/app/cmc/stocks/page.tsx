import { CmcTableClient } from "../CmcTableClient";

export const metadata = { title: "CMC Stocks — WCORE" };

export default function CmcStocksPage() {
  return <CmcTableClient endpoint="/api/cmc/stocks" title="CMC Stocks Top 5000" />;
}
