import { BubblesClient } from "../../BubblesClient";

export const metadata = { title: "Crypto Bubbles | WCORE" };

export default function CmcCryptoBubblesPage() {
  return <BubblesClient endpoint="/api/cmc/crypto" title="Crypto Bubbles" kind="crypto" tablePath="/cmc/crypto" popupPath="/cmc/crypto/bubbles/popup" />;
}
