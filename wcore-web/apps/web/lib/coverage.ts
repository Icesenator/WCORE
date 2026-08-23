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
      const stems = readdirSync(dir)
        .filter((file) => /\.(?:ts|js)$/.test(file) && !file.endsWith(".d.ts") && !file.startsWith("index."))
        .map((file) => file.replace(/\.(?:ts|js)$/, ""));
      const count = new Set(stems).size;
      if (count > 0) return count;
    } catch {
      continue;
    }
  }
  return 162;
}

export function getCoverageStats(): CoverageStats {
  return {
    chainConfigCount: registryChainCount(),
    cexProviderCount: CEX_PROVIDERS.length,
    gmEnabledChainCount: Object.keys(GM_FACTORIES).length,
  };
}
