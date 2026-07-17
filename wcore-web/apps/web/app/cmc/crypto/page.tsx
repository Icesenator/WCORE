import { CmcTableClient } from "../CmcTableClient";

export const metadata = { title: "Market Cap Crypto | WCORE" };

export default function CmcCryptoPage() {
  return (
    <CmcTableClient
      endpoint="/api/cmc/crypto"
      title="Market Cap Crypto"
      description="The leading crypto assets ranked by market capitalization."
      kind="crypto"
    />
  );
}
