"use client";
import { getApiUrl, apiFetch } from "@/lib/api";

import { useState } from "react";
const API_URL = getApiUrl();

interface WelcomeModalProps {
  referralCode?: string | null;
  onClose: () => void;
}

export function WelcomeModal({ referralCode, onClose }: WelcomeModalProps) {
  const [copied, setCopied] = useState(false);

  const refLink = referralCode ? `https://wcore.xyz?ref=${referralCode}` : null;

  const shareText = encodeURIComponent(
    "Tracking my portfolio across 183 chains and 7 CEX with WCORE\n\n" +
    "EVM · Solana · Cosmos · TON · Selected DeFi positions · Read only\n\n" +
    (refLink ? `Join with my referral: ${refLink}` : "Join now: https://wcore.xyz")
  );

  const markCompleted = () => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      apiFetch(`${API_URL}/api/auth/welcome`, { method: "POST" }).catch(() => {});
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-fg">Welcome to WCORE!</h2>
          <button onClick={onClose} className="text-muted hover:text-fg text-lg">&times;</button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted">
            Follow @WCORExyz and share your referral link. Earn 10% of your friends' points!
          </p>

          <div className="flex gap-2">
            <a
              href="https://x.com/intent/follow?screen_name=wcorexyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-[#1DA1F2] px-4 py-2.5 text-center text-xs font-semibold text-white hover:opacity-90 transition"
            >
              Follow @WCORExyz
            </a>
          </div>

          {refLink ? (
            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs text-muted mb-1">Your referral link:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-accent flex-1 truncate">{refLink}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="text-xs text-muted hover:text-fg shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <a
              href={`https://x.com/intent/tweet?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/30 px-4 py-2.5 text-center text-xs font-semibold text-[#1DA1F2] hover:bg-[#1DA1F2]/20 transition"
            >
              Share on X
            </a>
            <a
              href={`https://warpcast.com/~/compose?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-purple-500/10 border border-purple-500/30 px-4 py-2.5 text-center text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition"
            >
              Share on FC
            </a>
          </div>

          <button onClick={markCompleted} className="w-full rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/30 transition">
            Let's go!
          </button>
        </div>
      </div>
    </div>
  );
}
