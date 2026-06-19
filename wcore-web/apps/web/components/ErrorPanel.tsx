export interface ErrorPanelProps {
  title?: string;
  message: string;
}

export function ErrorPanel({ title = "Scan failed", message }: ErrorPanelProps) {
  return (
    <section className="rounded-lg border border-red-900/50 bg-red-950/30 p-5">
      <h2 className="mb-2 text-lg font-semibold text-red-200">{title}</h2>
      <p className="text-sm text-red-100">{message}</p>
    </section>
  );
}
