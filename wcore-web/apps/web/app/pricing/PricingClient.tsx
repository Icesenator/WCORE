"use client";

export function PricingClient() {
  return (
    <>
      {/* Free */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-bold mb-1">Free</h2>
        <p className="text-3xl font-bold mb-4">€0<span className="text-sm text-muted font-normal">/mo</span></p>
        <ul className="space-y-2 text-sm text-muted mb-6">
          <li>✓ Up to 120 chains per scan</li>
          <li>✓ Unlimited scans</li>
          <li>✓ CSV export</li>
          <li>✓ GM streaks &amp; badges</li>
          <li>✓ All features included</li>
        </ul>
        <div className="rounded bg-accent/10 px-3 py-2 text-xs text-accent text-center font-medium">
          WCORE is free for everyone
        </div>
      </div>

      {/* Pro — free for now */}
      <div className="rounded-lg border-2 border-accent bg-card p-6 relative">
        <span className="absolute -top-3 right-4 rounded-full bg-accent px-3 py-0.5 text-[10px] font-bold text-bg">FREE</span>
        <h2 className="text-lg font-bold mb-1">Pro</h2>
        <p className="text-3xl font-bold mb-4">€0<span className="text-sm text-muted font-normal">/mo</span></p>
        <ul className="space-y-2 text-sm text-muted mb-6">
          <li className="text-accent">✓ Up to 120 chains per scan</li>
          <li className="text-accent">✓ Unlimited scans</li>
          <li className="text-accent">✓ CSV export</li>
          <li className="text-accent">✓ GM streaks &amp; badges</li>
          <li className="text-accent">✓ Priority support</li>
        </ul>
        <div className="rounded bg-accent/10 px-3 py-2 text-xs text-accent text-center font-medium">
          All features are free during beta
        </div>
      </div>
    </>
  );
}
