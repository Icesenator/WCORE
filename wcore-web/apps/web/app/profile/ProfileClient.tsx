"use client";
import { getApiUrl, apiFetch } from "@/lib/api";

import { useEffect, useState, useCallback } from "react";
import { useWallet, ConnectButton } from "@/components/ConnectButton";
import { ChainIcon } from "@/components/ChainIcon";
import { usePreferences } from "@/components/PreferencesProvider";
import { useGmContracts } from "@/hooks/useGmContracts";
import { GmContractsPanel } from "./components/GmContractsPanel";
import { LinkedWallets } from "./components/LinkedWallets";
import { CustomTokens } from "./components/CustomTokens";
import { RecentScans } from "./components/RecentScans";
import { CexAccounts } from "./components/CexAccounts";
import { LogoSpinner } from "@/components/LogoSpinner";
import { buildCexWalletListItem, parseCexWalletAddress, type CexProvider, type CexWalletListItem } from "@/lib/cex-display";

const API_URL = getApiUrl();

export interface ProfileData {
  address: string;
  score: number;
  gmStreak: number;
  longestStreak: number;
  badges: Array<{ key: string; title: string; icon: string }>;
  recentScans: Array<{ chains: string[]; totalEur: number; tokenCount: number; createdAt: string }>;
  wallets?: Array<{ address: string; label: string; verificationStatus?: string }>;
}

export interface PointsBreakdownData {
  offChain: { days: number; points: number; detail: string };
  onChain: { count: number; points: number; detail: string };
  perChain: Array<{ chain: string; count: number; points: number; streak: number; bestStreak: number }>;
  quests: Array<{ key: string; title: string; points: number }>;
  questPts: number;
}

export interface CustomTokenRecord {
  id: string;
  contract: string;
  label: string | null;
  chainType: string;
}

export interface WalletRecord {
  id?: string;
  address: string;
  label: string | null;
  verificationStatus?: string;
  isCex?: boolean;
  icon?: string;
  totalEur?: number;
}

interface CexAccountApi {
  id: string;
  provider: CexProvider;
  label: string | null;
  holdings: Array<{ valueEur: number | null }>;
}

function cexAccountTotal(account: CexAccountApi): number {
  return Math.round(account.holdings.reduce((sum, h) => sum + (h.valueEur ?? 0), 0) * 100) / 100;
}

export interface PlanInfoData {
  plan: string;
  status?: string;
  expiresAt?: string | null;
}

export function ProfileClient({ defaultTab = "points" }: { defaultTab?: string }) {
  const { address, authStep } = useWallet();
  const isAuthenticated = authStep === "authenticated";
  const { t, formatValue } = usePreferences();
  const { contracts: gmContracts, withdrawingId, withdrawCreator, withdrawPlatform } = useGmContracts(address);

  const [newCtContract, setNewCtContract] = useState("");
  const [newCtLabel, setNewCtLabel] = useState("");
  const [customTokens, setCustomTokens] = useState<CustomTokenRecord[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [cexWallets, setCexWallets] = useState<CexWalletListItem[]>([]);
  const [addingWallet, setAddingWallet] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<PointsBreakdownData | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfoData | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ address: string; score: number; gmStreak: number }>>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [followedX, setFollowedX] = useState(false);
  const [streakAtRisk, setStreakAtRisk] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isAuthenticated) { setLoading(false); return; }
      try {
        const [profRes, lbRes, wRes, meRes, planRes] = await Promise.all([
          apiFetch(`/api/profile/${address}`),
          fetch(`${API_URL}/api/leaderboard`),
          apiFetch("/api/wallets"),
          apiFetch("/api/auth/me"),
          apiFetch("/api/me/plan"),
        ]);
        const profData = await profRes.json() as ProfileData & { error?: string };
        const lbData = await lbRes.json() as { leaderboard: Array<{ address: string; score: number; gmStreak: number }> };
        const walletData = await wRes.json() as { wallets?: WalletRecord[] };
        const meData = await meRes.json() as { breakdown?: PointsBreakdownData; referralCode?: string; referralEarnings?: number; gmStreak?: number; gmOffChainToday?: boolean; gmOnChainToday?: boolean };
        if (!profData.error) setProfile(profData);
        if (meData.breakdown) setBreakdown(meData.breakdown);
        if (meData.referralCode) setReferralCode(meData.referralCode);
        if (meData.referralEarnings != null) setReferralEarnings(meData.referralEarnings);
        if (meData.gmStreak && meData.gmStreak > 0 && !meData.gmOffChainToday && !meData.gmOnChainToday) {
          setStreakAtRisk(true);
        }
        setLeaderboard(lbData.leaderboard ?? []);
        if (walletData.wallets?.length) setWallets(walletData.wallets);
        try {
          const planData = await planRes.json() as PlanInfoData;
          if (planData.plan) setPlanInfo(planData);
        } catch { /* plan optional */ }
        // Custom tokens
        apiFetch("/api/custom-tokens")
          .then(r => r.json())
          .then((d: { tokens?: CustomTokenRecord[] }) => { if (d.tokens) setCustomTokens(d.tokens); })
          .catch((_e) => { console.error("Failed to load custom tokens:", _e); });
      } catch (_e) { console.error("Failed to load profile:", _e); /* load error */ }
      setLoading(false);
    })();
  }, [address, isAuthenticated]);

  const loadCexWallets = useCallback(async () => {
    if (!isAuthenticated) { setCexWallets([]); return; }
    try {
      const res = await apiFetch("/api/cex/accounts");
      if (!res.ok) { setCexWallets([]); return; }
      const data = await res.json() as { accounts?: CexAccountApi[] };
      setCexWallets((data.accounts ?? []).map((account) => buildCexWalletListItem({
        id: account.id,
        provider: account.provider,
        label: account.label,
        totalEur: cexAccountTotal(account),
      })));
    } catch (_e) {
      console.error("Failed to load CEX wallets:", _e);
      setCexWallets([]);
    }
  }, [isAuthenticated]);

  useEffect(() => { void loadCexWallets(); }, [loadCexWallets]);

  useEffect(() => {
    const handler = () => { void loadCexWallets(); };
    window.addEventListener("wcore-cex-updated", handler);
    return () => window.removeEventListener("wcore-cex-updated", handler);
  }, [loadCexWallets]);

  const addCustomToken = useCallback(async () => {
    const ct = newCtContract.trim();
    if (!ct) return;
    const res = await apiFetch("/api/custom-tokens", { method: "POST", body: JSON.stringify({ contract: ct, label: newCtLabel.trim() || null }) });
    const data = await res.json() as { token?: { id: string; contract: string; label: string | null; chainType: string }; error?: string };
    if (data.token && !customTokens.some(t => t.contract === data.token!.contract)) setCustomTokens([data.token, ...customTokens]);
    setNewCtContract(""); setNewCtLabel("");
  }, [newCtContract, newCtLabel, customTokens]);

  const removeCustomToken = useCallback(async (id: string) => {
    await apiFetch(`/api/custom-tokens/${id}`, { method: "DELETE" });
    setCustomTokens(customTokens.filter(t => t.id !== id));
  }, [customTokens]);

  const saveLabel = useCallback(async (id: string) => {
    const wallet = wallets.find((w) => w.id === id);
    if (!wallet) return;
    const newLabel = editLabel.trim() || null;
    try {
      if (id.startsWith("local-")) {
        // Create via POST, get back the real DB ID
        const res = await apiFetch("/api/wallets", {
          method: "POST",
          body: JSON.stringify({ address: wallet.address, label: newLabel, mode: "view_only" }),
        });
        const data = await res.json() as { wallet?: { id: string; address: string; label: string | null } };
        if (data.wallet) {
          setWallets(prev => prev.map(w => w.id === id ? { ...w, id: data.wallet!.id, label: data.wallet!.label } : w));
        }
      } else {
        // Update existing via PATCH
        await apiFetch(`/api/wallets/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: newLabel }),
        });
        setWallets(prev => prev.map(w => w.id === id ? { ...w, label: newLabel } : w));
      }
    } catch (_e) { console.error("Failed to save wallet label:", _e); /* API best-effort */ }
    setEditingId(null);
  }, [editLabel, wallets]);

  const _handleLabelMainWallet = useCallback(async () => {
    if (!address) return;
    setAddingWallet(true);
    try {
      const nonceRes = await fetch(`${API_URL}/api/wallets/nonce?address=${encodeURIComponent(address)}`);
      const { nonce, message } = await nonceRes.json() as { nonce?: string; message?: string };
      if (!nonce || !message) { setAddingWallet(false); return; }
      if (!window.ethereum) { alert("No wallet detected"); setAddingWallet(false); return; }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const signer = accounts.find((a: string) => a.toLowerCase() === address.toLowerCase()) || accounts[0];
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, signer] }) as string;
      const res = await apiFetch("/api/wallets", { method: "POST", body: JSON.stringify({ address, label: null, signature, message }) });
      const data = await res.json() as { wallet?: { id: string; address: string; label: string | null } };
      if (data.wallet) { setWallets([...wallets, data.wallet]); setEditingId(data.wallet.id); setEditLabel(""); }
    } catch { /* cancelled */ }
    setAddingWallet(false);
  }, [address, wallets]);

  const addWallet = useCallback(async () => {
    const addr = newAddr.trim();
    if (!addr) return;
    setAddingWallet(true);
    try {
      const res = await apiFetch("/api/wallets", { method: "POST", body: JSON.stringify({ address: addr, label: newLabel.trim() || null, mode: "view_only" }) });
      const data = await res.json() as { wallet?: WalletRecord; error?: string };
      if (data.error) { alert(data.error); setAddingWallet(false); return; }
      if (data.wallet && !wallets.some((w) => w.address.toLowerCase() === data.wallet!.address.toLowerCase())) {
        setWallets([...wallets, data.wallet]);
      }
      setNewAddr("");
      setNewLabel("");
    } catch (_e) { console.error("Failed to add wallet:", _e); /* ignore */ }
    setAddingWallet(false);
  }, [newAddr, newLabel, wallets]);

  const signLinkedWallet = useCallback(async (walletAddress: string) => {
    const addr = walletAddress.trim();
    if (!addr) return;
    setAddingWallet(true);
    try {
      const nonceRes = await fetch(`${API_URL}/api/wallets/nonce?address=${encodeURIComponent(addr)}`);
      const { nonce, message } = await nonceRes.json() as { nonce?: string; message?: string };
      if (!nonce || !message) { setAddingWallet(false); return; }
      if (!window.ethereum) { alert("No wallet detected"); setAddingWallet(false); return; }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const signer = accounts.find((a: string) => a.toLowerCase() === addr.toLowerCase()) || accounts[0];
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, signer] }) as string;
      await apiFetch(`/api/wallets/${walletAddress}/verify`, { method: "POST", body: JSON.stringify({ signature, message }) });
      window.location.reload();
    } catch (_e) { console.error("Failed to sign wallet:", _e); /* ignore */ }
    setAddingWallet(false);
  }, []);

  const removeWallet = useCallback(async (id: string) => {
    const cex = parseCexWalletAddress(id);
    if (cex) {
      await apiFetch(`/api/cex/accounts/${cex.id}`, { method: "DELETE" });
      setCexWallets(cexWallets.filter((w) => w.cexId !== cex.id));
      window.dispatchEvent(new Event("wcore-cex-updated"));
      return;
    }
    await apiFetch(`/api/wallets/${id}`, { method: "DELETE" });
    setWallets(wallets.filter((w) => w.id !== id));
  }, [cexWallets, wallets]);

  const handleEditStart = useCallback((id: string, currentLabel: string) => {
    setEditingId(id);
    setEditLabel(currentLabel);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleEditLabelChange = useCallback((val: string) => {
    setEditLabel(val);
  }, []);

  const handleNewAddrChange = useCallback((val: string) => {
    setNewAddr(val);
  }, []);

  const handleNewLabelChange = useCallback((val: string) => {
    setNewLabel(val);
  }, []);

  const handleCtContractChange = useCallback((val: string) => {
    setNewCtContract(val);
  }, []);

  const handleCtLabelChange = useCallback((val: string) => {
    setNewCtLabel(val);
  }, []);

  if (loading) {
    return (
      <div className="py-20">
        <LogoSpinner className="h-16 w-16" />
      </div>
    );
  }

  const scans = profile?.recentScans ?? [];
  const myRank = leaderboard.findIndex((u) => address && u.address.toLowerCase() === address.toLowerCase()) + 1;

  if (!address) {
    return (
      <div className="py-12">
        <h1 className="text-2xl font-bold mb-4">{t("profile")}</h1>
        <p className="text-muted mb-4">{t("connectProfile")}</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">{t("wallet")}</p>
            <p className="mt-1 font-mono text-sm sm:text-lg break-all">{address}</p>
            {(() => {
              const mainWallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
              const localId = `local-${(wallets.length)}`;
              if (!mainWallet) {
                // No wallet entry yet — create one on first label edit
                return (
                  <button type="button" onClick={() => { setEditingId(localId); setEditLabel(""); setWallets(prev => [...prev, { id: localId, address: address || "", label: null, verificationStatus: "UNSIGNED" }]); }} className="text-xs text-muted hover:text-fg mt-1">
                    + {t("label")}
                  </button>
                );
              }
              return editingId === mainWallet.id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} autoFocus className="w-28 rounded border border-border bg-bg px-2 py-0.5 text-xs text-fg outline-none focus:border-accent" onKeyDown={(e) => e.key === "Enter" && saveLabel(mainWallet.id!)} />
                    <button type="button" onClick={() => saveLabel(mainWallet.id!)} className="text-xs text-accent">{t("save")}</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted">{t("cancel")}</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-accent">{mainWallet.label || t("label")}</span>
                    <button type="button" onClick={() => { setEditingId(mainWallet.id!); setEditLabel(mainWallet.label ?? ""); }} className="text-xs text-muted hover:text-fg">{t("modify")}</button>
                  </div>
                );
            })()}
          </div>
          {myRank > 0 ? (
            <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">#{myRank}</span>
          ) : null}
        </div>
      </div>

      <div className="flex border-b border-border">
        {(["points", "wallets", "cex", "gm-contracts", "scans"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium transition border-b-2 -mb-[1px] ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {{ points: "Points", wallets: t("wallets") ?? "Wallets", cex: "CEX", "gm-contracts": "GM Contracts", scans: t("scans") ?? "Scans" }[tab]}
          </button>
        ))}
      </div>

      {activeTab === "points" ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-6 text-center">
            <p className="text-4xl font-bold text-accent">
              {profile?.score ?? 0}
            </p>
            <p className="text-xs uppercase tracking-wider text-muted mt-1">Points</p>
            <div className="flex items-center justify-center gap-4 mt-3 text-sm">
              <span className="text-fg">
                <span className="text-accent font-semibold">{profile?.gmStreak ?? 0}d</span>{" "}
                <span className="text-muted">GM Streak</span>
              </span>
              <span className="text-border">|</span>
              <span className="text-fg">
                <span className="text-accent font-semibold">{profile?.longestStreak ?? 0}d</span>{" "}
                <span className="text-muted">Best Streak</span>
              </span>
            </div>
          </div>

          {breakdown ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Points Breakdown</p>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs text-accent font-medium">
                  Off-chain: {breakdown.offChain.detail}
                </span>
                <span className="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs text-accent font-medium">
                  On-chain: {breakdown.onChain.detail}
                </span>
                {breakdown.questPts > 0 ? (
                  <span className="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs text-accent font-medium">
                    Quests: +{breakdown.questPts}
                  </span>
                ) : null}
              </div>
              {breakdown.perChain.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-muted">Per-chain Bonuses</p>
                    <span className="text-xs text-muted">
                      {breakdown.perChain.reduce((s: number, c: { points: number }) => s + c.points, 0)} pts total
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-bg/30">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">Chain</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">GMs</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">Streak</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">Best</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...breakdown.perChain]
                          .sort((a, b) => b.points - a.points)
                          .map((cg) => (
                          <tr key={cg.chain} className="border-b border-border/50 last:border-b-0 hover:bg-bg/20 transition-colors">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <ChainIcon chainKey={cg.chain.toUpperCase()} size="sm" />
                                <span className="text-fg text-xs font-medium truncate max-w-[120px] sm:max-w-none">
                                  {cg.chain.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-xs text-fg">{cg.count}</td>
                            <td className="px-3 py-2.5 text-center">
                              {cg.streak > 0 ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">
                                  {cg.streak}d
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-[11px] text-muted">{cg.bestStreak}d</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-accent">+{cg.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">How Points Work</p>
            <div className="space-y-3 text-xs text-muted">
              <div>
                <p className="text-fg font-medium mb-1">🌐 Off-chain GM</p>
                <p><span className="text-accent font-mono">+10</span> first day, <span className="text-accent font-mono">+10+N</span> day N streak. Free, 1×/day.</p>
              </div>
              <div>
                <p className="text-fg font-medium mb-1">⛽ On-chain GM</p>
                <p><span className="text-accent font-mono">+20</span> base per GM. <span className="text-accent font-mono">+2×N</span> global streak bonus (day N).</p>
                <p className="mt-1">Per-chain bonus: <span className="text-accent font-mono">+5</span> per GM on a chain, plus <span className="text-accent font-mono">+N</span> extra when that chain has an active streak of N days.</p>
              </div>
              <div>
                <p className="text-fg font-medium mb-1">🚀 GM Contract Creator</p>
                <p>Deploy on any supported chain. Earn <span className="text-accent font-mono">50%</span> of GM tips. Withdraw anytime from Profile.</p>
              </div>
              <div>
                <p className="text-fg font-medium mb-1">💰 Fees</p>
                <p>All fees in native chain asset. <span className="text-accent font-mono">50%</span> creator, <span className="text-accent font-mono">50%</span> platform. Funds maintenance &amp; future dev.</p>
              </div>
              <div>
                <p className="text-fg font-medium mb-1">🔗 Referral Program</p>
                <p>Share from Profile. Earn <span className="text-accent font-mono">+10%</span> of referral points. Follow <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a> to unlock.</p>
              </div>
            </div>
          </div>

          {streakAtRisk ? (
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-yellow-400">Streak Warning</p>
              <p className="text-sm mt-1">
                <span className="text-fg font-medium">{profile?.gmStreak ?? 0}-day streak</span>{" "}
                <span className="text-muted">at risk. Say GM off-chain or on any chain to keep it alive.</span>
              </p>
            </div>
          ) : null}

          {planInfo ? (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Current Plan</p>
              <p className="text-lg font-bold capitalize mt-1">{planInfo.plan}</p>
            </div>
          ) : null}

          {referralCode ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Referral Program</p>
              {!followedX && !localStorage.getItem("wc_followed_x") ? (
                <div className="mt-2">
                  <p className="text-xs text-muted mb-2">Follow @WCORExyz on X to unlock your referral link</p>
                  <a href="https://x.com/intent/follow?screen_name=wcorexyz" target="_blank" rel="noopener noreferrer" onClick={() => { localStorage.setItem("wc_followed_x", "1"); setFollowedX(true); }} className="inline-flex items-center gap-1.5 rounded bg-[#1DA1F2] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition">
                    𝕏 Follow @WCORExyz
                  </a>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-green-400 font-medium">Your referral link:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-accent bg-bg px-2 py-1 rounded flex-1 truncate">https://wcore.xyz?ref={referralCode}</code>
                    <button onClick={() => navigator.clipboard.writeText(`https://wcore.xyz?ref=${referralCode}`)} className="text-xs text-muted hover:text-fg">Copy</button>
                  </div>
                  {referralEarnings > 0 ? (
                    <p className="text-xs text-muted mt-1">+{referralEarnings} pts earned from referrals</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : activeTab === "wallets" ? (
        <div className="space-y-5">
          <LinkedWallets
            wallets={[...wallets.filter((w): w is { id: string; address: string; label: string | null; verificationStatus?: string } => w.id !== undefined), ...cexWallets.map((w) => ({ id: w.address, address: w.address, label: w.label, isCex: true, icon: w.icon, totalEur: w.totalEur }))]}
            newAddr={newAddr}
            newLabel={newLabel}
            addingWallet={addingWallet}
            editingId={editingId}
            editLabel={editLabel}
            t={t}
            onNewAddrChange={handleNewAddrChange}
            onNewLabelChange={handleNewLabelChange}
            onAddWallet={addWallet}
            onSignWallet={signLinkedWallet}
            onRemoveWallet={removeWallet}
            onSaveLabel={saveLabel}
            onEditStart={handleEditStart}
            onEditCancel={handleEditCancel}
            onEditLabelChange={handleEditLabelChange}
          />
          <CustomTokens
            tokens={customTokens}
            newContract={newCtContract}
            newLabel={newCtLabel}
            onContractChange={handleCtContractChange}
            onLabelChange={handleCtLabelChange}
            onAdd={addCustomToken}
            onRemove={removeCustomToken}
          />
        </div>
      ) : activeTab === "cex" ? (
        <CexAccounts formatValue={formatValue} />
      ) : activeTab === "gm-contracts" ? (
        <GmContractsPanel
          gmContracts={gmContracts}
          address={address}
          withdrawingId={withdrawingId}
          onWithdrawCreator={withdrawCreator}
          onWithdrawPlatform={withdrawPlatform}
        />
      ) : (
        <div className="space-y-5">
          <RecentScans scans={scans} formatValue={formatValue} />
        </div>
      )}
    </div>
  );
}
