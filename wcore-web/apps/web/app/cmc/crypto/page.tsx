import { CmcTableClient } from "../CmcTableClient";

export const metadata = { title: "CMC Crypto — WCORE" };

export default function CmcCryptoPage() {
  return <CmcTableClient endpoint="/api/cmc/crypto" title="CMC Crypto Top 5000" />;
}
