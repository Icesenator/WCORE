import type { Metadata } from "next";
import { SentinelClient } from "./SentinelClient";

export const metadata: Metadata = {
  title: "Chain Sentinel — WCORE",
  description: "Fermetures et migrations de réseaux : échéances, sources officielles et alertes.",
};

export default function SentinelPage() {
  return <SentinelClient />;
}
