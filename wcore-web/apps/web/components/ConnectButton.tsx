"use client";
import { advanceAuthGeneration, getApiUrl, apiFetch, getAuthGeneration } from "@/lib/api";
import { classifyWalletSignError, walletErrorLabel } from "@/lib/wallet-errors";
import { resolveRehydratedAuth, shouldHandleAuthExpired, type AuthStep } from "@/lib/auth-state";
import { useEip6963Providers, type Eip6963ProviderEntry, type Eip6963Provider } from "@/hooks/useEip6963Providers";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useConnectors } from "wagmi";

const API_URL = getApiUrl();

interface WalletState {
  address: string | null;
  loading: boolean;
  authStep: AuthStep;
  error: string;
  pickOpen: boolean;
  detectedWallets: Eip6963ProviderEntry[];
  rawProvider: Eip6963Provider | null;
  connect: () => Promise<void>;
  connectWith: (connectorId: string) => Promise<void>;
  openPicker: () => void;
  closePicker: () => void;
  disconnect: () => void;
  clearError: () => void;
}

const WalletCtx = createContext<WalletState>({
  address: null, loading: false, authStep: "idle", error: "", pickOpen: false, detectedWallets: [], rawProvider: null,
  connect: async () => {}, connectWith: async () => {}, openPicker: () => {}, closePicker: () => {},
  disconnect: () => {}, clearError: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected, connector: activeConnector } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const connectors = useConnectors();
  const eip6963Wallets = useEip6963Providers();

  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authStep, _setAuthStep] = useState<AuthStep>("idle");
  const [error, setError] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [rawProvider, setRawProvider] = useState<Eip6963Provider | null>(null);
  const authGenerationRef = useRef(getAuthGeneration());

  const setAuthStep = useCallback((next: AuthStep) => {
    _setAuthStep(next);
  }, []);

  // Rehydrate from localStorage address + verify with API via cookies
  useEffect(() => {
    const storedAddr = localStorage.getItem("wcore_address");
    if (!storedAddr) return;
    const rehydrateGeneration = authGenerationRef.current;

    apiFetch(`${API_URL}/api/auth/me`)
      .then(async r => {
        let verifiedAddress: string | null = null;
        try {
          const data = await r.json() as { address?: string };
          verifiedAddress = data.address ?? null;
        } catch { /* non-JSON auth responses are handled by status */ }

        if (rehydrateGeneration !== authGenerationRef.current) return;
        const next = resolveRehydratedAuth(storedAddr, r.status, r.ok, verifiedAddress);
        if (next.clearStoredAddress) localStorage.removeItem("wcore_address");
        else if (next.address) localStorage.setItem("wcore_address", next.address);
        setAddress(next.address);
        setAuthStep(next.authStep);
      })
      .catch(() => {
        if (rehydrateGeneration !== authGenerationRef.current) return;
        const next = resolveRehydratedAuth(storedAddr, 0, false);
        if (next.address) localStorage.setItem("wcore_address", next.address);
        setAddress(next.address);
        setAuthStep(next.authStep);
      });
  }, [setAuthStep]);

  useEffect(() => {
    const handler = () => setAuthStep("expired");
    const authExpiredHandler = (event: Event) => {
      const eventGeneration = (event as CustomEvent<{ authGeneration?: number }>).detail?.authGeneration;
      if (eventGeneration == null || !shouldHandleAuthExpired(eventGeneration, authGenerationRef.current)) return;
      const storedAddr = localStorage.getItem("wcore_address");
      if (storedAddr) {
        setAddress(storedAddr.toLowerCase());
        setAuthStep("ready");
      } else {
        setAuthStep("expired");
      }
    };
    window.addEventListener("wcore-logout", handler);
    window.addEventListener("wcore-auth-expired", authExpiredHandler);
    return () => {
      window.removeEventListener("wcore-logout", handler);
      window.removeEventListener("wcore-auth-expired", authExpiredHandler);
    };
  }, [setAuthStep]);

  const prevAddressRef = useRef(address);
  const prevAuthStepRef = useRef(authStep);
  useEffect(() => {
    // A selected EIP-6963 provider owns the session. An older eager wagmi
    // connection must not overwrite its account identity.
    if (rawProvider) return;
    if (isConnected && wagmiAddress) {
      const addr = wagmiAddress.toLowerCase();
      if (authStep === "authenticated" && prevAddressRef.current && prevAddressRef.current !== addr) {
        setAuthStep("ready");
      }
      if (prevAddressRef.current !== addr) {
        setAddress(addr);
        localStorage.setItem("wcore_address", addr);
        prevAddressRef.current = addr;
      }
      if ((authStep === "idle" || authStep === "expired") && prevAuthStepRef.current === authStep) {
        setAuthStep("ready");
      }
      prevAuthStepRef.current = authStep;
    }
  }, [isConnected, wagmiAddress, authStep, rawProvider, setAuthStep]);

  // Declared before signAndLogin/signAndLoginRaw which call it (avoids TDZ-style
  // use-before-declaration and lets the hooks list it as a dependency).
  const sendLogin = useCallback(async (addr: string, message: string, signature: string) => {
    setAuthStep("verifying");
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
    const loginBody: Record<string, string> = { message, signature, address: addr };
    if (urlParams) loginBody.ref = urlParams;
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(loginBody),
    });
    if (!res.ok) {
      let serverError = `server_error_${res.status}`;
      try { const e = await res.json() as { error?: string; message?: string }; if (e.error) serverError = e.error; } catch { /* non-JSON */ }
      throw new Error(serverError);
    }
    const data = await res.json() as { user?: { id: string; address: string }; error?: string };
    if (data.user) {
      localStorage.setItem("wcore_address", addr);
      authGenerationRef.current = advanceAuthGeneration();
      setAuthStep("authenticated");
    } else {
      throw new Error(data.error ?? "login_failed");
    }
  }, [setAuthStep]);

  const signAndLogin = useCallback(async (addr: string, chainId: number) => {
    setAuthStep("signing");
    const nonceRes = await fetch(`${API_URL}/api/auth/nonce?address=${addr}&chainId=${chainId || 1}`, { credentials: "include" });
    if (!nonceRes.ok) throw new Error("network_error");
    const nonceData = await nonceRes.json() as { message?: string; error?: string };
    if (!nonceData.message) throw new Error(nonceData.error === "missing_address" ? "invalid_address" : "nonce_failed");

    let signature: string;
    try {
      signature = await signMessageAsync({ message: nonceData.message, connector: activeConnector, account: addr as `0x${string}` });
    } catch (signError) {
      console.error("[ConnectButton] wagmi signMessage failed:", signError);
      const code = classifyWalletSignError(signError);
      if (code === "signature_refused") throw new Error(code, { cause: signError });
      // Fallback: try the raw injected provider, useful when wagmi's connector
      // is bound to a wallet that lost the window.ethereum injection race.
      if (typeof window !== "undefined" && window.ethereum && typeof (window.ethereum as { request?: unknown }).request === "function") {
        try {
          signature = await (window.ethereum as { request: (a: { method: string; params: unknown[] }) => Promise<string> }).request({ method: "personal_sign", params: [nonceData.message, addr] });
        } catch (fallbackError) {
          console.error("[ConnectButton] injected personal_sign failed:", fallbackError);
          throw new Error(classifyWalletSignError(fallbackError), { cause: fallbackError });
        }
      } else {
        throw new Error(code, { cause: signError });
      }
    }

    await sendLogin(addr, nonceData.message, signature);
  }, [activeConnector, signMessageAsync, sendLogin, setAuthStep]);

  // Sign + login using a raw EIP-6963 provider. Used when the user picks a
  // wallet announced via EIP-6963 — we talk to it directly, never going
  // through wagmi's `injected` connector (intentionally not registered
  // because its Turbopack chunk breaks under extension conflicts).
  const signAndLoginRaw = useCallback(async (addr: string, chainId: number, provider: Eip6963Provider) => {
    setAuthStep("signing");
    const nonceRes = await fetch(`${API_URL}/api/auth/nonce?address=${addr}&chainId=${chainId || 1}`, { credentials: "include" });
    if (!nonceRes.ok) throw new Error("network_error");
    const nonceData = await nonceRes.json() as { message?: string; error?: string };
    if (!nonceData.message) throw new Error(nonceData.error === "missing_address" ? "invalid_address" : "nonce_failed");

    let signature: string;
    try {
      signature = (await provider.request({ method: "personal_sign", params: [nonceData.message, addr] })) as string;
    } catch (signError) {
      console.error("[ConnectButton] EIP-6963 personal_sign failed:", signError);
      throw new Error(classifyWalletSignError(signError), { cause: signError });
    }
    await sendLogin(addr, nonceData.message, signature);
  }, [sendLogin, setAuthStep]);

  const connectWith = useCallback(async (connectorId: string) => {
    setError("");
    setPickOpen(false);
    setLoading(true);
    setAuthStep("connecting");
    try {
      // EIP-6963 path: connect directly to the announced provider, bypassing
      // wagmi's `injected` connector (which is intentionally not registered
      // because its Turbopack chunk breaks under extension conflicts).
      if (connectorId.startsWith("eip6963:")) {
        const uuid = connectorId.slice("eip6963:".length);
        const entry = eip6963Wallets.find(e => e.info.uuid === uuid);
        if (!entry) throw new Error("wallet_not_detected");
        const accounts = (await entry.provider.request({ method: "eth_requestAccounts" })) as string[];
        const addr = (accounts[0] ?? "").toLowerCase();
        if (!addr) throw new Error("No account returned from wallet.");
        const chainIdHex = (await entry.provider.request({ method: "eth_chainId" })) as string;
        const chainId = chainIdHex ? parseInt(chainIdHex, 16) : 1;
        setRawProvider(entry.provider);
        setAddress(addr);
        await signAndLoginRaw(addr, chainId, entry.provider);
        return;
      }

      const connector = connectors.find(c => c.id === connectorId)
        ?? connectors[0];
      if (!connector) throw new Error("wallet_not_found");
      setRawProvider(null);
      const result = await connectAsync({ connector });
      const addr = result.accounts[0]?.toLowerCase() ?? "";
      if (!addr) throw new Error("No account returned from wallet.");
      setAddress(addr);
      await signAndLogin(addr, result.chainId);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "connect_failed";
      console.error("[ConnectButton] login failed:", raw, e);
      if (/Cannot redefine property|read only property|only a getter/i.test(raw)) {
        setError("wallet_extension_conflict");
        setAuthStep("idle");
      } else {
        setError(classifyWalletSignError(e));
        setAuthStep("idle");
      }
    } finally {
      setLoading(false);
    }
  }, [connectors, connectAsync, signAndLogin, signAndLoginRaw, eip6963Wallets, setAuthStep]);

  const connect = useCallback(async () => {
    // Show wallet picker if multiple wallets are detected or if injected is risky.
    const injectedIds = connectors.filter(c => c.id === "injected" || c.type === "injected");
    const nonInjected = connectors.filter(c => c.id !== "injected" && c.type !== "injected");
    if (nonInjected.length > 0 || injectedIds.length > 1 || eip6963Wallets.length > 1) {
      setPickOpen(true);
      return;
    }
    const target = injectedIds[0] ?? connectors[0];
    if (!target) {
      setError("No wallet detected. Install MetaMask or use WalletConnect.");
      return;
    }
    await connectWith(target.id);
  }, [connectors, eip6963Wallets, connectWith]);

  const openPicker = useCallback(() => setPickOpen(true), []);
  const closePicker = useCallback(() => setPickOpen(false), []);

  const disconnect = useCallback(() => {
    authGenerationRef.current = advanceAuthGeneration();
    wagmiDisconnect();
    setAddress(null);
    setRawProvider(null);
    localStorage.removeItem("wcore_address");
    setAuthStep("idle");
    fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [wagmiDisconnect, setAuthStep]);

  const clearError = useCallback(() => setError(""), []);

  return (
    <WalletCtx.Provider value={{ address, loading, authStep, error, pickOpen, detectedWallets: eip6963Wallets, rawProvider, connect, connectWith, openPicker, closePicker, disconnect, clearError }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  return useContext(WalletCtx);
}

export function ConnectButton() {
  const { address, loading, authStep, error, pickOpen, detectedWallets, connect, connectWith, openPicker, closePicker, disconnect, clearError } = useWallet();
  const connectors = useConnectors();

  const walletOptions: Array<{ id: string; name: string; subtitle: string; icon: string }> = [];
  const seen = new Set<string>();
  for (const entry of detectedWallets) {
    if (seen.has(entry.info.rdns)) continue;
    seen.add(entry.info.rdns);
    walletOptions.push({ id: `eip6963:${entry.info.uuid}`, name: entry.info.name, subtitle: entry.info.rdns, icon: entry.info.icon });
  }
  // Always offer WalletConnect (QR code) and Coinbase. The wagmi `injected`
  // connector was removed from the static config because its Turbopack chunk
  // breaks under extension conflicts; users can still reach a MetaMask in-page
  // provider through the EIP-6963 picker if their extension is healthy.
  for (const c of connectors) {
    if (c.id === "walletConnect") {
      walletOptions.push({ id: "walletConnect", name: "WalletConnect", subtitle: "Scan QR code — works with any wallet on your phone", icon: "" });
    } else if (c.id === "coinbaseWallet") {
      walletOptions.push({ id: "coinbaseWallet", name: "Coinbase Wallet", subtitle: "coinbase.com wallet", icon: "" });
    }
  }
  if (walletOptions.length === 0) {
    walletOptions.push({ id: "walletConnect", name: "WalletConnect", subtitle: "Scan QR code — works with any wallet on your phone", icon: "" });
  }

  const walletPicker = pickOpen ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20" onClick={closePicker}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">Connect a wallet</h3>
          <button onClick={closePicker} className="text-muted hover:text-fg" aria-label="Close">✕</button>
        </div>
        <div className="flex flex-col gap-1">
          {walletOptions.length === 0 && (
            <p className="p-3 text-sm text-muted">No wallet detected. Install MetaMask or use WalletConnect (QR code).</p>
          )}
          {walletOptions.map((opt) => (
            <button
              key={`${opt.id}:${opt.name}`}
              onClick={() => connectWith(opt.id)}
              disabled={loading}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-left text-sm hover:border-accent disabled:opacity-50 transition-colors"
            >
              {opt.icon ? (
                <img src={opt.icon} alt={opt.name} className="h-6 w-6 rounded" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs">WC</div>
              )}
              <span className="flex-1">
                <span className="block font-medium text-fg">{opt.name}</span>
                <span className="block text-xs text-muted">{opt.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted">
          If a wallet fails to connect, try another one. Browser extension conflicts on
          <code className="mx-1 rounded bg-muted px-1">window.ethereum</code>
          can block injected wallets — WalletConnect via QR code always works.
        </p>
      </div>
    </div>
  ) : null;

  if (authStep === "authenticated" && address) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={disconnect}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted hover:text-fg transition-colors"
        >
          {address.slice(0, 6)}...{address.slice(-4)}
        </button>
      </div>
    );
  }

  if (authStep === "ready" && address) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{address.slice(0, 6)}...{address.slice(-4)}</span>
          <button
            onClick={connect}
            disabled={loading}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Verifying..." : "Sign In"}
          </button>
          <button onClick={disconnect} className="text-xs text-muted hover:text-fg transition-colors" title="Disconnect">✕</button>
        </div>
        {error && (
          <div className="text-xs text-destructive">
            {walletErrorLabel(error)}
            <button onClick={clearError} className="ml-1 underline">Dismiss</button>
          </div>
        )}
        {walletPicker}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={openPicker}
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (authStep === "connecting" ? "Connecting..." : authStep === "signing" ? "Sign in your wallet..." : "Verifying...") : "Connect Wallet"}
        </button>
        {walletOptions.length > 0 && (
          <button
            onClick={openPicker}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted hover:text-fg transition-colors"
            title="Choose wallet"
          >
            ▾
          </button>
        )}
      </div>
      {error && (
        <div className="text-xs text-destructive">
          {walletErrorLabel(error)}
          <button onClick={clearError} className="ml-1 underline">Dismiss</button>
        </div>
      )}
      {walletPicker}
    </div>
  );
}
