export interface AlertEvent {
  type: "circuit_opened" | "circuit_closed" | "circuit_half_open" | "health_degraded" | "redis_down" | "db_down";
  severity: "critical" | "warning" | "info";
  service: string;
  ts: string;
  data: Record<string, unknown>;
}

const FETCH_TIMEOUT_MS = 5000;
const SERVICE_NAME = process.env.SERVICE_NAME ?? "wcore-api";

let _fetchImpl: typeof fetch | undefined;

export function setAlertFetch(fn: typeof fetch): void {
  _fetchImpl = fn;
}

export function isAlertingConfigured(): boolean {
  return !!process.env["ALERT_WEBHOOK_URL"];
}

function getWebhookUrl(): string {
  return process.env["ALERT_WEBHOOK_URL"] ?? "";
}

export async function sendAlert(event: AlertEvent): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;

  const payload = {
    ...event,
    service: SERVICE_NAME,
    ts: event.ts || new Date().toISOString(),
  };

  const fetcher = _fetchImpl ?? fetch;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch {
    // fire-and-forget: silently ignore failures
  }
}
