import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CEX_PROVIDERS, GM_FACTORIES } from "@wcore/shared";

export interface CoverageStats {
  chainConfigCount: number;
  cexProviderCount: number;
  gmEnabledChainCount: number;
}

function registryChainCount(): number {
  const candidates = [
    resolve(process.cwd(), "../../../wcore-gsheet/dist/chains"),
    resolve(process.cwd(), "../../wcore-gsheet/dist/chains"),
    "/wcore-gsheet/dist/chains",
  ];
  for (const dir of candidates) {
    try {
      return readdirSync(dir).filter((file) => file.endsWith(".ts") && file !== "index.ts").length;
    } catch {
      continue;
    }
  }
  throw new Error("chain registry not found");
}

export function getCoverageStats(): CoverageStats {
  return {
    chainConfigCount: registryChainCount(),
    cexProviderCount: CEX_PROVIDERS.length,
    gmEnabledChainCount: Object.keys(GM_FACTORIES).length,
  };
}
