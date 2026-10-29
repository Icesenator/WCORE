"use client";
import { ConnectButton } from "@/components/ConnectButton";
import { buildSupportPublicContent, type SupportLanguage } from "@/lib/support-public-content";

export function SupportPublicHelp({
  language,
}: {
  language: SupportLanguage;
}) {
  const c = buildSupportPublicContent(language);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-3">{c.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{c.intro}</p>
      </header>

      <section aria-label={c.limitsHeading} className="space-y-4">
        {c.sections.map((s) => (
          <div key={s.heading} className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-fg">{s.heading}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section aria-label={c.reportHeading} className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{c.reportHeading}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          {c.reportItems.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section aria-label={c.channelHeading} className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{c.channelHeading}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{c.channelBody}</p>
        <a
          href={c.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block max-w-full break-all rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent hover:bg-accent/10 focus-visible:outline-accent"
        >
          {c.channelUrl}
        </a>
        <p role="note" className="mt-3 text-xs leading-relaxed text-muted">{c.channelCaveat}</p>
      </section>

      <section aria-label={c.walletHeading} className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <h2 className="text-sm font-semibold text-accent">{c.walletHeading}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{c.walletBody}</p>
        <div className="mt-3"><ConnectButton /></div>
        <p className="mt-2 text-xs text-muted">{c.walletCta}</p>
      </section>

      <p role="alert" className="text-sm font-medium text-red-400">{c.privacy}</p>
    </div>
  );
}
