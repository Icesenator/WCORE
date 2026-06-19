interface Wallet {
  id: string;
  address: string;
  label: string | null;
  verificationStatus?: string;
  isCex?: boolean;
  icon?: string;
  totalEur?: number;
}

interface LinkedWalletsProps {
  wallets: Wallet[];
  newAddr: string;
  newLabel: string;
  addingWallet: boolean;
  editingId: string | null;
  editLabel: string;
  t: (key: string) => string;
  onNewAddrChange: (val: string) => void;
  onNewLabelChange: (val: string) => void;
  onAddWallet: () => void;
  onSignWallet: (address: string) => void;
  onRemoveWallet: (id: string) => void;
  onSaveLabel: (id: string) => void;
  onEditStart: (id: string, currentLabel: string) => void;
  onEditCancel: () => void;
  onEditLabelChange: (val: string) => void;
}

export function getLinkedWalletStatus(verificationStatus?: string): {
  signed: boolean;
  label: "Signed" | "Unsigned";
  title: string;
} {
  const signed = verificationStatus === "SIGNED";
  return {
    signed,
    label: signed ? "Signed" : "Unsigned",
    title: signed ? "Wallet signed and verified on the server" : "View-only wallet. Sign later to prove ownership",
  };
}

export function LinkedWallets({
  wallets,
  newAddr,
  newLabel,
  addingWallet,
  editingId,
  editLabel,
  t,
  onNewAddrChange,
  onNewLabelChange,
  onAddWallet,
  onSignWallet,
  onRemoveWallet,
  onSaveLabel,
  onEditStart,
  onEditCancel,
  onEditLabelChange,
}: LinkedWalletsProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {t("linkedWallets")} ({wallets.length})
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newAddr}
          onChange={(e) => onNewAddrChange(e.target.value)}
          placeholder="0x... / cosmos1... / Solana..."
          className="flex-1 rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="text"
          value={newLabel}
          onChange={(e) => onNewLabelChange(e.target.value)}
          placeholder={t("label")}
          className="w-28 rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onAddWallet}
          disabled={!newAddr.trim() || addingWallet}
          className="rounded bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40 transition"
        >
          {addingWallet ? "..." : t("add")}
        </button>
      </div>
      {wallets.length === 0 ? (
        <p className="text-sm text-muted text-center py-2">{t("noLinkedWallets")}</p>
      ) : (
        <div className="space-y-1.5">
          {wallets.map((w) => {
            const status = getLinkedWalletStatus(w.verificationStatus);
            return (
              <div
                key={w.id}
                className="flex items-center justify-between rounded border border-border/60 bg-bg/30 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className={`${w.isCex ? "font-semibold text-fg" : "font-mono"} text-xs truncate block`}>
                    {w.isCex ? (w.label ?? "CEX") : w.address}{" "}
                    {!w.isCex ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-medium rounded px-1 py-px ${
                          status.signed
                            ? "text-green-400 bg-green-400/10 border border-green-400/20"
                            : "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
                        }`}
                        title={status.title}
                      >
                        {status.label}
                      </span>
                    ) : null}
                  </span>
                  {editingId === w.id ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => onEditLabelChange(e.target.value)}
                        autoFocus
                        className="w-28 rounded border border-border bg-bg px-2 py-0.5 text-xs text-fg outline-none focus:border-accent"
                        onKeyDown={(e) => e.key === "Enter" && onSaveLabel(w.id)}
                      />
                      <button type="button" onClick={() => onSaveLabel(w.id)} className="text-xs text-accent">
                        {t("save")}
                      </button>
                      <button type="button" onClick={onEditCancel} className="text-xs text-muted">
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                      <span>{w.isCex ? "Exchange account" : (w.label || "-")}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {!w.isCex && !status.signed ? (
                    <button
                      type="button"
                      onClick={() => onSignWallet(w.address)}
                      className="text-xs text-accent hover:text-accent/80 transition"
                    >
                      Sign later
                    </button>
                  ) : null}
                  {!w.isCex ? (
                    <button
                      type="button"
                      onClick={() => onEditStart(w.id, w.label ?? "")}
                      className="text-xs text-muted hover:text-fg transition"
                    >
                      {t("modify")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveWallet(w.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
