import { usePreferences } from "./PreferencesProvider";

export interface WalletHeaderProps {
  address: string;
  chainCount: number;
  tokenCount: number;
  valueEur: number;
  generatedAt: string;
}

export function WalletHeader({ address, chainCount, tokenCount, valueEur, generatedAt }: WalletHeaderProps) {
  const { formatValue, t } = usePreferences();
  return (
    <section className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted">{t("wallet")}</p>
      <h1 className="break-all font-mono text-lg sm:text-xl">{address}</h1>

      <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
        <Stat label={t("totalValue")} value={formatValue(valueEur)} />
        <Stat label={t("chains")} value={String(chainCount)} />
        <Stat label={t("tokens")} value={String(tokenCount)} />
        <Stat label={t("scanned")} value={formatTime(generatedAt)} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold sm:text-xl">{value}</p>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
