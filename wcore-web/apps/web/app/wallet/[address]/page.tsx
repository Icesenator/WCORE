import { WalletContent } from "@/components/WalletContent";

export default async function WalletPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ chains?: string; deep?: string; ct?: string; linked?: string; labels?: string }>;
}) {
  const { address } = await params;
  const { chains: chainsParam, deep: deepParam, ct: customTokens, linked: linkedParam, labels: labelsParam } = await searchParams;

  const addresses = decodeURIComponent(address).split(",").map((a) => a.trim()).filter(Boolean);
  const linked = linkedParam ? decodeURIComponent(linkedParam).split(",").map((a) => a.trim()).filter(Boolean) : [];
  const chains = chainsParam ? chainsParam.split(",").map((c) => c.trim()).filter(Boolean) : ["BASE", "ETHEREUM"];
  const deepScan = deepParam === "1";

  const walletLabels: Record<string, string> = {};
  if (labelsParam) {
    for (const part of labelsParam.split(",")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        walletLabels[part.slice(0, eqIdx).toLowerCase()] = decodeURIComponent(part.slice(eqIdx + 1));
      }
    }
  }

  return <WalletContent addresses={addresses} linkedAddresses={linked} chains={chains} deepScan={deepScan} customTokens={customTokens} walletLabels={walletLabels} />;
}
