interface CustomToken {
  id: string;
  contract: string;
  label: string | null;
  chainType: string;
}

interface CustomTokensProps {
  tokens: CustomToken[];
  newContract: string;
  newLabel: string;
  onContractChange: (val: string) => void;
  onLabelChange: (val: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function CustomTokens({
  tokens,
  newContract,
  newLabel,
  onContractChange,
  onLabelChange,
  onAdd,
  onRemove,
}: CustomTokensProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Custom Tokens ({tokens.length})
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newContract}
          onChange={(e) => onContractChange(e.target.value)}
          placeholder="0x..."
          className="flex-1 rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="text"
          value={newLabel}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Label"
          className="w-28 rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!newContract.trim()}
          className="rounded bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40 transition"
        >
          Add
        </button>
      </div>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted text-center py-2">
          No custom tokens. Add contracts to track them in every scan.
        </p>
      ) : (
        <div className="space-y-1.5">
          {tokens.map((ct) => (
            <div
              key={ct.id}
              className="flex items-center justify-between rounded border border-border/60 bg-bg/30 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-xs truncate block">{ct.contract}</span>
                {ct.label ? <span className="text-xs text-accent">{ct.label}</span> : null}
              </div>
              <button
                type="button"
                onClick={() => onRemove(ct.id)}
                className="text-xs text-red-400 hover:text-red-300 transition ml-2"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
