import { CmcTableClient } from "../CmcTableClient";

export const metadata = { title: "Market Cap Stock | WCORE" };

export default function CmcStocksPage() {
  return (
    <CmcTableClient
      endpoint="/api/cmc/stocks"
      title="Market Cap Stock"
      description="The world's largest public companies ranked by market capitalization."
      kind="stock"
    />
  );
}
