import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CEX_PROVIDERS, GM_FACTORIES, isRetiredChain } from "@wcore/shared";

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
      // Runtime lookup only. Without turbopackIgnore, Next 16.4 cannot bound this
      // cwd-relative path and traces the whole project into the standalone server.
      const stems = readdirSync(/* turbopackIgnore: true */ dir)
        .filter((file) => /\.(?:ts|js)$/.test(file) && !file.endsWith(".d.ts") && !file.startsWith("index."))
        .filter((file) => {
          const stem = file.replace(/\.(?:ts|js)$/, "");
          if (isRetiredChain(stem)) return false;
          const source = readFileSync(resolve(dir, file), "utf8");
          const key = source.match(/\bkey\s*:\s*["']([^"']+)["']/)?.[1];
          const id = source.match(/\bCHAIN_ID\s*:\s*["']?(0x[\da-f]+|\d+)/i)?.[1];
          return !isRetiredChain(key ?? stem) && !isRetiredChain(String(id ? Number(id) : ""));
        })
        .map((file) => file.replace(/\.(?:ts|js)$/, ""));
      const count = new Set(stems).size;
      if (count > 0) return count;
    } catch {
      continue;
    }
  }
  return 158;
}

export function getCoverageStats(): CoverageStats {
  return {
    chainConfigCount: registryChainCount(),
    cexProviderCount: CEX_PROVIDERS.length,
    gmEnabledChainCount: Object.keys(GM_FACTORIES).length,
  };
}
