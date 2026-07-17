"use client";
import { getApiUrl, apiFetch } from "@/lib/api";
import { getExplorerUrl } from "@/lib/explorers";

import { useState, useEffect, useMemo } from "react";
import type { TokenAsset } from "@wcore/shared";
import { TokenIcon } from "./TokenIcon";
import { usePreferences } from "./PreferencesProvider";
import { detectScam, isAdminBlocked, isAdminApproved } from "./scam-detector";
import { buildScamEntry, removeScamOverride, writeScamOverride } from "@/lib/scam-overrides";
import { isCexSyntheticContract } from "@/lib/cex-display";

type AugmentedTokenAsset = TokenAsset & {
  _isScam?: boolean;
  _hasIssue?: boolean;
  _scamReasons?: string[];
};

export interface TokenTableProps {
  native: TokenAsset | null;
  tokens: TokenAsset[];
  chainKey: string;
  connectedAddress?: string;
}

const INITIAL_SHOW = 5;

type SortColumn = "symbol" | "balance" | "price" | "value";

function isDefiPosition(symbol: string, name: string): boolean {
  const n = name.toLowerCase();
  const s = symbol.toUpperCase();
  if (n.includes("[flex]") || n.includes("[lock]")) return true;
  if (/^staked\b/i.test(n)) return true;
  if (/\b(defi|receipt|vault)\b/i.test(n)) return true;
  if (/\b(liquid stak|stak)\b/i.test(n)) return true;
  if (/^C-(?!EX\b)/.test(s) && /\b(aidrop|stak|lock)\b/i.test(n)) return true;
  if (s.startsWith("S") && /^S[A-Z]/.test(symbol) && !/^(SOL|SUI|SEI|STRK|SHIB|STX|SNX|SAND|SUSHI|SNT|STORJ|SNM|SFP|SC|SFP|SKL|SPELL|STRAX|STG|SWELL|SYN)$/i.test(s)) {
    if (/^staked\b/i.test(n) || /\bstak/i.test(n) || /receipt/i.test(n)) return true;
  }
  return false;
}

function formatBalance(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: value >= 1 ? 6 : 10,
  }).format(value);
}

export function TokenTable({ native, tokens, chainKey, connectedAddress }: TokenTableProps) {
  const { formatValue, t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const [sortCol, setSortCol] = useState<SortColumn>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Admin: local overrides for instant real-time update (no page reload needed).
  // isAdminBlocked/isAdminApproved (from scam-detector) are used for contract-aware
  // checks; this counter forces re-renders when overrides change cross-component.
  const [, setOverrideVersion] = useState(0);
  useEffect(() => {
    const handler = () => setOverrideVersion(v => v + 1);
    window.addEventListener("wcore-scam-override", handler);
    return () => window.removeEventListener("wcore-scam-override", handler);
  }, []);
  const [reportingToken, setReportingToken] = useState<string | null>(null);
  const [reportDone, setReportDone] = useState<string | null>(null);
  // Separate healthy tokens from problematic ones (scam, no price, error)
  const tokenList = useMemo(() => tokens.map(t => {
    const isCexAsset = isCexSyntheticContract(t.contract);
    const isDefiAsset = t.flags.includes("DEFI");
    const scam = isCexAsset || isDefiAsset ? { isSuspicious: false, reasons: [] as string[] } : detectScam(t.symbol, t.name, t.balance, t.priceEur, t.contract);
    const adminIsScam = isCexAsset || isDefiAsset ? false : isAdminBlocked(t.symbol, t.contract) ? true : isAdminApproved(t.symbol, t.contract) ? false : scam.isSuspicious;
    return {
      ...t,
      _isScam: t.contract !== "native" && adminIsScam,
      _hasIssue: !!(!isCexAsset && (t.priceEur == null || (Array.isArray(t.flags) && t.flags.includes("NO_PRICE")) || adminIsScam)),
      _scamReasons: scam.reasons,
    };
  }), [tokens]);
  const healthy = useMemo(() => tokenList.filter(t => !t._hasIssue).sort((a, b) => (b.valueEur ?? -Infinity) - (a.valueEur ?? -Infinity)), [tokenList]);
  const problematic = useMemo(() => tokenList.filter(t => t._hasIssue).sort((a, b) => (b.valueEur ?? -Infinity) - (a.valueEur ?? -Infinity)), [tokenList]);
  const sortedTokens = useMemo(() => [...healthy, ...problematic], [healthy, problematic]);
  const assets = useMemo(() => native ? [native, ...sortedTokens] : sortedTokens, [native, sortedTokens]);
  // Default: native + INITIAL_SHOW healthy tokens. Expanded: everything
  const _healthyTotal = healthy.length + (native ? 1 : 0);
  const showAll = expanded;
  const _visible = showAll ? assets : assets.filter((a, i) => i === 0 && native ? true : i <= INITIAL_SHOW && !(a as AugmentedTokenAsset)._hasIssue);
  // If native is index 0, always show it. Then show up to INITIAL_SHOW healthy tokens.
  const defaultVisible = useMemo(() => {
    const visible: typeof assets = [];
    if (native) visible.push(native);
    for (const t of healthy) {
      if (visible.length - (native ? 1 : 0) < INITIAL_SHOW) visible.push(t);
    }
    return visible;
  }, [native, healthy]);
  const visibleFinal = useMemo(() => {
    const base = showAll ? assets : defaultVisible;
    const nativeItem = base.find(a => a.contract === "native");
    const tokens = base.filter(a => a.contract !== "native");
    const getVal = (a: TokenAsset): number => {
      switch (sortCol) {
        case "balance": return a.balance;
        case "price": return a.priceEur ?? -Infinity;
        case "value": return a.valueEur ?? -Infinity;
        default: return 0;
      }
    };
    const sortedTokens = [...tokens].sort((a, b) => {
      if (sortCol === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const av = getVal(a);
      const bv = getVal(b);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return nativeItem ? [nativeItem, ...sortedTokens] : sortedTokens;
  }, [showAll, assets, defaultVisible, sortCol, sortDir]);
  const _hidden = assets.length - visibleFinal.length;

  const handleReport = async (asset: TokenAsset, isCurrentlyScam: boolean) => {
    setReportingToken(asset.contract);
    const API_URL = getApiUrl();
    const PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
    const storedAddr = window.localStorage.getItem("wcore_address")?.toLowerCase() ?? "";
    const isAdmin = (connectedAddress?.toLowerCase() || storedAddr) === PLATFORM_OWNER;

    try {
      if (isAdmin) {
        // Admin: apply locally first (instant), then sync to backend.
        // Use the shared write helpers so the local entry shape stays in sync
        // with the contract-aware read path consumed by ChainCard.
        const entry = buildScamEntry(asset.symbol, asset.contract);
        if (isCurrentlyScam) {
          writeScamOverride("approved", entry);
          removeScamOverride("blocked", entry);
        } else {
          writeScamOverride("blocked", entry);
          removeScamOverride("approved", entry);
        }
        setOverrideVersion(v => v + 1);
        setReportDone(asset.contract);
        const action = isCurrentlyScam ? "approve" : "block";
        apiFetch(`${API_URL}/api/admin/scam-override`, {
          method: "POST",
          body: JSON.stringify({ symbol: asset.symbol, action, contract: asset.contract !== "native" ? asset.contract : undefined }),
        }).catch(() => {});
      } else {
        const res = await apiFetch(`${API_URL}/api/tickets`, {
          method: "POST",
          body: JSON.stringify({
            title: isCurrentlyScam ? `Token report: ${asset.symbol} is LEGIT` : `Token report: ${asset.symbol} is SCAM`,
            description: [
              `Chain: ${chainKey}`,
              `Contract: ${asset.contract}`,
              `Symbol: ${asset.symbol}`,
              `Name: ${asset.name}`,
              `Current scam status: ${isCurrentlyScam ? "flagged as scam" : "clean"}`,
            ].join("\n"),
            type: "bug",
          }),
        });
        if (res.ok) setReportDone(asset.contract);
      }
    } catch { /* report best-effort */ }
    setReportingToken(null);
  };

  if (!assets.length) {
    return <p className="py-3 text-center text-sm text-muted">{t("noAssetsFound")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[40%] sm:w-[55%]" />
          <col className="w-[22%] sm:w-[15%]" />
          <col className="w-[18%] sm:w-[15%]" />
          <col className="w-[20%] sm:w-[15%]" />
        </colgroup>
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="py-2 font-medium text-left">
              <button onClick={() => { if (sortCol === "symbol") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol("symbol"); setSortDir("asc"); } }} className="hover:text-fg transition inline-flex items-center gap-1">
                {t("asset")}
                <span className="text-[9px]">{sortCol === "symbol" ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </th>
            <th className="py-2 font-medium text-right">
              <button onClick={() => { if (sortCol === "balance") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol("balance"); setSortDir("desc"); } }} className="hover:text-fg transition inline-flex items-center gap-1">
                {t("balance")}
                <span className="text-[9px]">{sortCol === "balance" ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </th>
            <th className="py-2 font-medium text-right">
              <button onClick={() => { if (sortCol === "price") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol("price"); setSortDir("desc"); } }} className="hover:text-fg transition inline-flex items-center gap-1">
                {t("price")}
                <span className="text-[9px]">{sortCol === "price" ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </th>
            <th className="py-2 font-medium text-right">
              <button onClick={() => { if (sortCol === "value") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol("value"); setSortDir("desc"); } }} className="hover:text-fg transition inline-flex items-center gap-1">
                {t("value")}
                <span className="text-[9px]">{sortCol === "value" ? (sortDir === "asc" ? "▲" : "▼") : "▼"}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleFinal.map((asset, index) => {
            const isNative = asset.contract === "native";
            const isCexAsset = isCexSyntheticContract(asset.contract);
            const isScam = (asset as AugmentedTokenAsset)._isScam === true;
            const _hasIssue = (asset as AugmentedTokenAsset)._hasIssue === true;
            const isDefi = !isNative && !isCexAsset && (asset.flags.includes("DEFI") || isDefiPosition(asset.symbol, asset.name));
            const explorerUrl = !isNative && !isCexAsset ? getExplorerUrl(chainKey, asset.contract) : null;
            const shortContract = !isNative && !isCexAsset ? asset.contract.slice(0, 6) + "..." + asset.contract.slice(-4) : null;

            return (
              <tr key={`${asset.contract ?? asset.symbol}-${index}`} className={`border-b last:border-0 transition ${isNative ? "bg-accent/5" : "border-border/60 hover:bg-card/80"}`}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2.5">
                    <TokenIcon symbol={asset.symbol} size="sm" logoUrl={asset.logoUrl} />
                    <div>
                      <span className={`font-medium ${isNative ? "text-accent" : "text-fg"}`}>
                        {asset.symbol}
                        {isNative ? <span className="ml-1 text-[10px] uppercase text-accent/60">{t("nativeToken")}</span> : null}
                      </span>
                      {asset.flags.includes("NO_PRICE") && !isNative && !isCexAsset ? (
                        <span className="ml-1.5 rounded bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-300">{t("noPrice")}</span>
                      ) : null}
                      {!isNative && isScam ? <span className="ml-1.5 rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-300" title={(asset as AugmentedTokenAsset)._scamReasons?.join(", ")}>⚠️ SCAM</span> : null}
                      {isDefi ? <span className="ml-1.5 rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300" title="DeFi position (staked, locked, liquid staking, flex)">DeFi</span> : null}
                      {!isNative && !isCexAsset ? (
                        <button
                          type="button"
                          onClick={() => handleReport(asset, isScam)}
                          disabled={reportingToken === asset.contract}
                          className={`ml-1 text-xs hover:opacity-80 transition ${reportDone === asset.contract ? "text-green-400" : isScam ? "text-green-400/60" : "text-red-400/60"}`}
                          title={reportDone === asset.contract ? "Reported, thanks!" : isScam ? "Report this token as LEGIT (not scam)" : "Report this token as SCAM"}
                        >
                          {reportingToken === asset.contract ? "..." : reportDone === asset.contract ? "✓" : isScam ? "✅" : "🚩"}
                        </button>
                      ) : null}
                      <p className="text-xs text-muted hidden sm:block">
                        {asset.name}
                        {!isNative && shortContract ? (
                          <span className="inline-flex items-center gap-1 ml-1">
                            <code
                              className="text-[11px] text-muted/70 font-mono cursor-pointer hover:text-fg transition"
                              title="Click to copy"
                              onClick={async (e) => {
                                try { await navigator.clipboard.writeText(asset.contract); const el = e.currentTarget; el.setAttribute('data-copied', '1'); setTimeout(() => el.removeAttribute('data-copied'), 1500); } catch { /* noop */ }
                              }}
                            >{asset.contract}</code>
                            {explorerUrl ? (
                              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted hover:text-accent transition" title="Open in explorer">
                                ↗
                              </a>
                          ) : null}
                      </span>
                    ) : null}
                  </p>
                </div>
                  </div>
                </td>
                <td className={`py-2.5 text-right font-mono ${isNative ? "text-accent" : "text-fg"}`}>{formatBalance(asset.balance)}</td>
                <td className="py-2.5 text-right font-mono">
                  {asset.priceEur == null ? (
                    <span className="text-muted">&mdash;</span>
                  ) : (
                    <span className={isNative ? "text-accent" : "text-fg"}>{formatValue(asset.priceEur)}</span>
                  )}
                </td>
                <td className={`py-2.5 text-right font-mono font-semibold ${isNative ? "text-accent" : "text-fg"}`}>
                  {isScam ? (
                    <span className="text-red-400/60" title="Scam token — excluded from total">⚠️</span>
                  ) : asset.valueEur == null ? (
                    <span className="text-muted">&mdash;</span>
                  ) : (
                    formatValue(asset.valueEur)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {assets.length > INITIAL_SHOW + 1 ? (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 w-full rounded border border-border/60 py-1.5 text-xs text-muted hover:text-fg transition">
          {expanded ? `− ${t("showLess")}` : `+ ${assets.length - (INITIAL_SHOW + 1)} ${assets.length - (INITIAL_SHOW + 1) > 1 ? t("moreAssetsPlural") : t("moreAssets")}`}
        </button>
      ) : null}
    </div>
  );
}
