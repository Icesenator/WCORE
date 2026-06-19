"use client";

import { useState, useEffect, useMemo } from "react";
import { LogoSpinner } from "@/components/LogoSpinner";
import { Logo } from "@/components/Logo";
import { getActiveFactoryChains } from "@wcore/shared";
import { buildAddEthereumChainParams } from "./chain-params";
import { switchWalletChain } from "./chain-switch";
import { pickBuild, PARIS_BUILD_CHAINS, type BuildOutput } from "./build-selector";

const PLATFORM_OWNER = "0x17d518736Ee9341dcDc0A2498e013D33CFCDD080";

const DEPLOYED = new Set(getActiveFactoryChains());
const DEFAULT_IMPLEMENTATIONS: Record<string, string> = {
  moonbeam: "0x50f43583d89979b9dade753caadd53894f5cdbcc",
};

// Subset of chainList we expose in the deploy dropdown. Source of truth lives in @wcore/core —
// adding/renaming a chain there is automatically picked up here, eliminating the chainId-drift
// bug class (Ink 0xdef0 stale, Abstract chainId, etc.) that hit us multiple times.
const DEPLOY_CHAIN_KEYS = [
  "BASE", "ETHEREUM", "ARBITRUM_ONE", "OPTIMISM", "POLYGON", "BSC", "AVALANCHE",
  "GNOSIS", "ZKSYNC_ERA", "SCROLL", "LINEA", "MANTLE", "BLAST", "SONIC", "CELO",
  "FRAXTAL", "WORLDCHAIN", "UNICHAIN", "BERACHAIN", "INK", "ABSTRACT", "SONEIUM",
  "POLYGON_ZKEVM", "ARBITRUM_NOVA", "ZORA", "MODE", "SEI",
  // L2s / OP Stack / Superchains
  "SUPERSEED", "SHAPE", "ANCIENT8", "BOB", "LISK", "METAL_L2", "REDSTONE",
  "APPCHAIN", "CAMP", "DUCKCHAIN", "CYBER", "RARI", "ZIRCUIT",
  "OPENLEDGER", "STABLE", "TAC", "MITOSIS", "B3", "CITREA",
  // EVM-compatible majors
  "CRONOS", "FUSE", "KAIA", "MOONBEAM", "MOONRIVER", "ASTAR", "AURORA",
  "METIS", "BOBA", "ROOTSTOCK", "PULSECHAIN", "KCC", "CORE", "FLARE",
  "XDC", "X_LAYER", "CONFLUX", "SHIBARIUM", "DEGEN", "BEAM", "RONIN",
  "OPBNB", "GRAVITY", "MERLIN", "MANTA_PACIFIC", "TAIKO_ALETHIA", "PLASMA",
  "HASHKEY", "HEMI", "HYPEREVM", "IMMUTABLE", "MORPH", "MEZO", "REYA",
  "SWELLCHAIN", "SWAN", "VANA", "STORY", "INTUITION",
  "ETHERLINK", "PLUME", "POLYNOMIAL", "SUPERPOSITION", "SYNDICATE_COMMONS",
  "SOMNIA", "MONAD", "MEGAETH", "MATCHAIN", "RACE", "DOMA",
  "B2", "BOTANIX", "CODEX", "JUCHAIN", "KATANA", "LENS", "MIND",
  "OG", "ZERO", "ZETACHAIN", "ZKLINKNOVA", "DBK_CHAIN", "GEB",
  "BITLAYER", "CORN", "FLOW",
] as const;

const CHAIN_META: Record<string, { name: string; chainId: number }> = {
  BASE: { name: "Base", chainId: 8453 },
  ETHEREUM: { name: "Ethereum", chainId: 1 },
  ARBITRUM_ONE: { name: "Arbitrum One", chainId: 42161 },
  OPTIMISM: { name: "Optimism", chainId: 10 },
  POLYGON: { name: "Polygon", chainId: 137 },
  BSC: { name: "BNB Chain", chainId: 56 },
  AVALANCHE: { name: "Avalanche", chainId: 43114 },
  GNOSIS: { name: "Gnosis", chainId: 100 },
  ZKSYNC_ERA: { name: "zkSync Era", chainId: 324 },
  SCROLL: { name: "Scroll", chainId: 534352 },
  LINEA: { name: "Linea", chainId: 59144 },
  MANTLE: { name: "Mantle", chainId: 5000 },
  BLAST: { name: "Blast", chainId: 81457 },
  SONIC: { name: "Sonic", chainId: 146 },
  CELO: { name: "Celo", chainId: 42220 },
  FRAXTAL: { name: "Fraxtal", chainId: 252 },
  WORLDCHAIN: { name: "World Chain", chainId: 480 },
  UNICHAIN: { name: "Unichain", chainId: 130 },
  BERACHAIN: { name: "Berachain", chainId: 80094 },
  INK: { name: "Ink", chainId: 57073 },
  ABSTRACT: { name: "Abstract", chainId: 2741 },
  SONEIUM: { name: "Soneium", chainId: 1868 },
  POLYGON_ZKEVM: { name: "Polygon zkEVM", chainId: 1101 },
  ARBITRUM_NOVA: { name: "Arbitrum Nova", chainId: 42170 },
  ZORA: { name: "Zora", chainId: 7777777 },
  MODE: { name: "Mode", chainId: 34443 },
  SEI: { name: "Sei", chainId: 1329 },
  // L2s / OP Stack / Superchains
  SUPERSEED: { name: "Superseed", chainId: 5330 },
  SHAPE: { name: "Shape", chainId: 360 },
  ANCIENT8: { name: "Ancient8", chainId: 888888888 },
  BOB: { name: "BOB", chainId: 60808 },
  LISK: { name: "Lisk", chainId: 1135 },
  METAL_L2: { name: "Metal L2", chainId: 1750 },
  REDSTONE: { name: "Redstone", chainId: 690 },
  APPCHAIN: { name: "AppChain", chainId: 466 },
  CAMP: { name: "Camp", chainId: 484 },
  DUCKCHAIN: { name: "DuckChain", chainId: 5545 },
  CYBER: { name: "Cyber", chainId: 7560 },
  RARI: { name: "RARI Chain", chainId: 1380012617 },
  ZIRCUIT: { name: "Zircuit", chainId: 48900 },
  OPENLEDGER: { name: "OpenLedger", chainId: 1612 },
  STABLE: { name: "Stable", chainId: 988 },
  TAC: { name: "TAC", chainId: 239 },
  MITOSIS: { name: "Mitosis", chainId: 124816 },
  B3: { name: "B3", chainId: 8333 },
  FOGO: { name: "Fogo", chainId: 4242 },
  CITREA: { name: "Citrea", chainId: 4114 },
  // EVM-compatible majors
  CRONOS: { name: "Cronos", chainId: 25 },
  FUSE: { name: "Fuse", chainId: 122 },
  KAIA: { name: "Kaia", chainId: 8217 },
  MOONBEAM: { name: "Moonbeam", chainId: 1284 },
  MOONRIVER: { name: "Moonriver", chainId: 1285 },
  ASTAR: { name: "Astar", chainId: 592 },
  AURORA: { name: "Aurora", chainId: 1313161554 },
  METIS: { name: "Metis", chainId: 1088 },
  BOBA: { name: "Boba", chainId: 288 },
  ROOTSTOCK: { name: "Rootstock", chainId: 30 },
  PULSECHAIN: { name: "PulseChain", chainId: 369 },
  KCC: { name: "KCC", chainId: 321 },
  CORE: { name: "Core", chainId: 1116 },
  FLARE: { name: "Flare", chainId: 14 },
  XDC: { name: "XDC Network", chainId: 50 },
  X_LAYER: { name: "X Layer", chainId: 196 },
  CONFLUX: { name: "Conflux eSpace", chainId: 1030 },
  SHIBARIUM: { name: "Shibarium", chainId: 109 },
  DEGEN: { name: "Degen", chainId: 666666666 },
  BEAM: { name: "Beam", chainId: 4337 },
  RONIN: { name: "Ronin", chainId: 2020 },
  OPBNB: { name: "opBNB", chainId: 204 },
  GRAVITY: { name: "Gravity", chainId: 1625 },
  MERLIN: { name: "Merlin", chainId: 4200 },
  MANTA_PACIFIC: { name: "Manta Pacific", chainId: 169 },
  TAIKO_ALETHIA: { name: "Taiko Alethia", chainId: 167000 },
  PLASMA: { name: "Plasma", chainId: 9745 },
  HASHKEY: { name: "HashKey", chainId: 177 },
  HEMI: { name: "Hemi", chainId: 43111 },
  HYPEREVM: { name: "HyperEVM", chainId: 999 },
  IMMUTABLE: { name: "Immutable zkEVM", chainId: 13371 },
  MORPH: { name: "Morph", chainId: 2818 },
  MEZO: { name: "Mezo", chainId: 31612 },
  REYA: { name: "Reya Network", chainId: 1729 },
  SWELLCHAIN: { name: "Swell Chain", chainId: 1923 },
  SWAN: { name: "Swan", chainId: 254 },
  VANA: { name: "Vana", chainId: 1480 },
  STORY: { name: "Story", chainId: 1514 },
  INTUITION: { name: "Intuition", chainId: 1155 },
  ETHERLINK: { name: "Etherlink", chainId: 42793 },
  PLUME: { name: "Plume", chainId: 98866 },
  POLYNOMIAL: { name: "Polynomial", chainId: 8008 },
  SUPERPOSITION: { name: "Superposition", chainId: 55244 },
  SYNDICATE_COMMONS: { name: "Syndicate Commons", chainId: 510003 },
  SOMNIA: { name: "Somnia", chainId: 5031 },
  MONAD: { name: "Monad", chainId: 143 },
  MEGAETH: { name: "MegaETH", chainId: 4326 },
  MATCHAIN: { name: "Matchain", chainId: 698 },
  RACE: { name: "RACE", chainId: 6805 },
  DOMA: { name: "Doma", chainId: 97477 },
  B2: { name: "B2", chainId: 223 },
  BOTANIX: { name: "Botanix", chainId: 3637 },
  CODEX: { name: "Codex", chainId: 81224 },
  JUCHAIN: { name: "JuChain Mainnet", chainId: 210000 },
  KATANA: { name: "Katana", chainId: 747474 },
  LENS: { name: "Lens", chainId: 232 },
  MIND: { name: "Mind Network", chainId: 228 },
  OG: { name: "0G Mainnet", chainId: 16661 },
  ZERO: { name: "ZERO Network", chainId: 543210 },
  ZETACHAIN: { name: "ZetaChain", chainId: 7000 },
  ZKLINKNOVA: { name: "zkLink Nova", chainId: 810180 },
  DBK_CHAIN: { name: "DBK Chain", chainId: 20240603 },
  GEB: { name: "GEB", chainId: 11501 },
  BITLAYER: { name: "Bitlayer", chainId: 200901 },
  CORN: { name: "Corn", chainId: 21000000 },
  FLOW: { name: "Flow EVM", chainId: 747 },
};

type DeployBuildOutput = BuildOutput;

export function DeployClient() {
  const [build, setBuild] = useState<DeployBuildOutput | null>(null);
  const [gmOnChainAddr, setGmOnChainAddr] = useState("");
  const [factoryAddr, setFactoryAddr] = useState("");
  const [step, setStep] = useState<"gm" | "factory" | "done">("gm");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [chainKey, setChainKey] = useState("base");
  const [customChainId, setCustomChainId] = useState("");

  useEffect(() => {
    fetch("/build.json")
      .then(r => r.json())
      .then(setBuild)
      .catch(() => setError("Failed to load contract builds"));
  }, []);

  const deployChains = useMemo(() => {
    return DEPLOY_CHAIN_KEYS.flatMap((coreKey) => {
      const meta = CHAIN_META[coreKey];
      if (!meta) return [];
      return [{
        key: coreKey.toLowerCase(),
        name: meta.name,
        chainId: "0x" + meta.chainId.toString(16),
        chainIdNum: meta.chainId,
      }];
    });
  }, []);
  const chainInfo = deployChains.find((c) => c.key === chainKey);
  const chainId = customChainId || chainInfo?.chainId || "0x1";

  useEffect(() => {
    const saved = localStorage.getItem(`gm_impl_${chainKey}`) || DEFAULT_IMPLEMENTATIONS[chainKey] || "";
    setGmOnChainAddr(saved);
    setStep(saved ? "factory" : "gm");
    // UX guard: if the saved GmOnChain has empty bytecode (e.g. a previous deploy
    // reverted on-chain, which is exactly what happened on KCC with PUSH0), the
    // factory would be wired to a broken implementation. Auto-clear so the user
    // re-runs Step 1 with a working build.
    if (saved && /^0x[a-fA-F0-9]{40}$/.test(saved) && window.ethereum) {
      window.ethereum.request({ method: "eth_getCode", params: [saved, "latest"] })
        .then((code: unknown) => {
          if (typeof code === "string" && code === "0x") {
            localStorage.removeItem(`gm_impl_${chainKey}`);
            setGmOnChainAddr("");
            setStep("gm");
            setError(`Saved GmOnChain ${saved} has empty bytecode on-chain — cleared. Re-run Step 1 to deploy a working implementation.`);
          }
        })
        .catch(() => { /* best-effort */ });
    }
  }, [chainKey]);

  if (!build) return <LogoSpinner className="h-12 w-12" />;

  async function deployGmOnChain() {
    if (!build || !window.ethereum) { setError("Builds not loaded or no wallet"); return; }
    setDeploying(true); setError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      await switchWalletChain(window.ethereum, chainId, buildAddEthereumChainParams);
      const gmOnChainBuild = pickBuild(build, chainKey, "GmOnChain");
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], data: gmOnChainBuild.bin }],
      }) as string;
      let addr = "";
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] }) as { contractAddress?: string } | null;
        if (receipt?.contractAddress) { addr = receipt.contractAddress; break; }
      }
      if (!addr) throw new Error("Deployment timed out");
      setGmOnChainAddr(addr);
      localStorage.setItem(`gm_impl_${chainKey}`, addr);
      setStep("factory");
    } catch (e) { setError((e as Error).message); }
    setDeploying(false);
  }

  async function deployFactory() {
    if (!build || !window.ethereum) { setError("Builds not loaded or no wallet"); return; }
    if (!gmOnChainAddr) { setError("Deploy GmOnChain first"); return; }
    setDeploying(true); setError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      await switchWalletChain(window.ethereum, chainId, buildAddEthereumChainParams);
      const factoryBuild = pickBuild(build, chainKey, "GmFactory");
      const encodedArgs = "000000000000000000000000" + PLATFORM_OWNER.slice(2) + "000000000000000000000000" + gmOnChainAddr.slice(2);
      const data = factoryBuild.bin + encodedArgs;
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], data }],
      }) as string;
      let addr = "";
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] }) as { contractAddress?: string } | null;
        if (receipt?.contractAddress) { addr = receipt.contractAddress; break; }
      }
      if (!addr) throw new Error("Deployment timed out");
      setFactoryAddr(addr);
      setStep("done");
    } catch (e) { setError((e as Error).message); }
    setDeploying(false);
  }

  const chainIdNum = parseInt(chainId, 16);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-2">Target Chain</p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={chainKey}
            onChange={(e) => { setChainKey(e.target.value); setCustomChainId(""); }}
            className="rounded bg-bg border border-border px-3 py-1.5 text-sm"
          >
            {deployChains.map((c) => (
              DEPLOYED.has(c.key) ? (
                <option key={c.key} value={c.key} disabled className="text-muted">{c.name} ({c.chainIdNum}) — deployed</option>
              ) : (
                <option key={c.key} value={c.key}>{c.name} ({c.chainIdNum})</option>
              )
            ))}
          </select>
          <input
            type="text"
            placeholder="Custom chainId (hex, e.g. 0x2105)"
            value={customChainId}
            onChange={(e) => setCustomChainId(e.target.value)}
            className="rounded bg-bg border border-border px-3 py-1.5 text-sm font-mono w-56"
          />
          <span className="text-xs text-muted font-mono">{chainId} ({chainIdNum})</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-2">Step 1: GmOnChain Implementation</p>
        {PARIS_BUILD_CHAINS.has(chainKey.toUpperCase()) ? (
          <p className="text-xs text-yellow-400 mb-2">Paris EVM build (solc 0.8.19) — pre-Shanghai chain without PUSH0 opcode.</p>
        ) : null}
        <button type="button" onClick={deployGmOnChain} disabled={deploying || step !== "gm"} className="rounded bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40 transition">
          {deploying && step === "gm" ? <Logo className="h-4 w-4 text-accent animate-spin inline-block" /> : "Deploy GmOnChain"}
        </button>
        {gmOnChainAddr ? <p className="mt-2 font-mono text-xs text-green-400">Deployed: {gmOnChainAddr}</p> : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-2">Step 2: GmFactory</p>
        <p className="text-xs text-muted mb-2">Platform: {PLATFORM_OWNER}</p>
        <label className="mb-2 block text-xs text-muted">
          Implementation
          <input
            value={gmOnChainAddr}
            onChange={(e) => {
              const value = e.target.value.trim();
              setGmOnChainAddr(value);
              if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
                localStorage.setItem(`gm_impl_${chainKey}`, value);
                setStep("factory");
              } else {
                localStorage.removeItem(`gm_impl_${chainKey}`);
                setStep("gm");
              }
            }}
            placeholder="0x... (deploy GmOnChain first)"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 font-mono text-xs text-fg"
          />
        </label>
        <button type="button" onClick={deployFactory} disabled={deploying || step !== "factory"} className="rounded bg-yellow-400/20 px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-yellow-400/30 disabled:opacity-40 transition">
          {deploying && step === "factory" ? <Logo className="h-4 w-4 text-yellow-400 animate-spin inline-block" /> : "Deploy GmFactory"}
        </button>
        {factoryAddr ? <p className="mt-2 font-mono text-xs text-green-400">Deployed: {factoryAddr}</p> : null}
      </div>

      {step === "done" ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5">
          <p className="text-sm font-semibold text-accent mb-2">Deployment Complete</p>
          <p className="text-xs text-muted mb-3">Add this factory to the shared config:</p>
          <pre className="rounded bg-bg p-3 text-xs font-mono text-fg overflow-x-auto">{`// packages/shared/src/factories.ts
${chainKey}: { address: "${factoryAddr}", chainId: ${chainIdNum} },

// RPCs are resolved centrally from @wcore/core chain configs.`}</pre>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
