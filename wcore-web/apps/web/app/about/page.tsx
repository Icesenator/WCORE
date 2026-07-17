export default function AboutPage() {
  return (
    <main className="mx-auto min-h-screen w-full px-4 py-8 sm:px-6 sm:py-12">

      <h1 className="mb-1 text-2xl font-bold">About WCORE</h1>
      <p className="mb-8 text-sm text-muted">Your crypto. Every chain. One view. 183 chains, 80+ GM contracts, 7 CEX sources. Read only. Free.</p>

      <div className="grid gap-6 lg:grid-cols-2 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">How it works</h2>
          <p className="text-muted">
            WCORE is a <span className="text-fg font-medium">non-custodial, read-only</span> portfolio tracker.
            Connect your wallet or paste any public address. We query blockchains directly via RPC
            nodes. You can also add your own read-only API keys for Binance, Bitpanda, Bitfinex,
            Bybit, Coinbase, Kraken and OKX in Profile to fold your exchange balances into the
            same portfolio view. No middlemen, no custody,
            no funds ever at risk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">Chain coverage</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="font-semibold text-accent mb-1 text-xs">EVM</p>
              <p className="text-muted text-xs">Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Gnosis and more. Native balance + ERC-20 token discovery.</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="font-semibold text-purple-400 mb-1 text-xs">Solana</p>
              <p className="text-muted text-xs">SPL token accounts via getTokenAccountsByOwner. Jupiter pricing integration.</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="font-semibold text-blue-400 mb-1 text-xs">Cosmos</p>
              <p className="text-muted text-xs">Bank balances + staking delegations. IBC tokens on Cosmos Hub, Osmosis, Injective, Terra.</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
            <p className="font-semibold text-cyan-300 mb-1 text-xs">TON (new)</p>
            <p className="text-muted text-xs">Native Toncoin (9 decimals) plus jettons via TonAPI with Toncenter fallback. Address detection recognises user-friendly base64 (EQ/UQ) and raw -1:hex formats.</p>
          </div>
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="font-semibold text-emerald-300 mb-1 text-xs">CEX (new)</p>
            <p className="text-muted text-xs">Binance (Spot, Earn flexible, Earn locked), Bitpanda (crypto, fiat, commodities, stocks), Bitfinex (exchange/spot wallet), Bybit (Unified + Funding), Coinbase and OKX. Each user supplies their own read-only API key, encrypted server-side (AES-GCM). Prices come from the provider first, then DefiLlama or Yahoo Finance for symbols the ticker does not cover.</p>
          </div>
          <p className="mt-3 text-muted text-xs">
            8 chains with no live RPC endpoints (CROSS_MAINNET, ETHO_PROTOCOL, HAVEN1, MOCA_CHAIN, POLYNOMIAL, RIVALZ, STACK, SURFLAYER) are auto-skipped by the scan engine. They are kept in the registry for reactivation when their RPCs return.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">Pricing</h2>
          <p className="text-muted">
            Real-time prices from a cascade: DefiLlama → DexScreener → GeckoTerminal → Jupiter → CoinGecko.
            Stablecoins use a fast FX path. CEX prices are provider-first: Binance via our
            CEX relay ticker batch, Bitpanda via their public ticker, Coinbase/OKX balances via
            signed relay reads, and US stocks fall back to Yahoo Finance. Multi currency: EUR, USD, GBP, CHF, JPY.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">Features</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2"><span className="text-accent">⛽</span><span className="text-muted text-xs"><strong className="text-fg">On-chain GM</strong>. Say GM across 80 supported chains. Deploy your contract, earn 50% of tips.</span></div>
            <div className="flex gap-2"><span className="text-accent">🏦</span><span className="text-muted text-xs"><strong className="text-fg">CEX tracking</strong>. Link your own Binance, Bitpanda, Bitfinex, Bybit, Coinbase or OKX read-only API key. Spot, Earn, commodities, stocks, all in one view.</span></div>
            <div className="flex gap-2"><span className="text-accent">🔗</span><span className="text-muted text-xs"><strong className="text-fg">Referral system</strong>. Share your link, earn 10% of your referrals points.</span></div>
            <div className="flex gap-2"><span className="text-accent">🚩</span><span className="text-muted text-xs"><strong className="text-fg">Scam detection</strong>. 7-rule engine flags suspicious tokens.</span></div>
            <div className="flex gap-2"><span className="text-accent">👛</span><span className="text-muted text-xs"><strong className="text-fg">Multi-wallet</strong>. Link addresses, labels, CSV export.</span></div>
            <div className="flex gap-2"><span className="text-accent">🏆</span><span className="text-muted text-xs"><strong className="text-fg">Leaderboard</strong>. Compete on points with daily GM streaks.</span></div>
            <div className="flex gap-2"><span className="text-accent">🪙</span><span className="text-muted text-xs"><strong className="text-fg">Custom tokens</strong>. Add any ERC-20 contract. Visible to all users.</span></div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">Architecture</h2>
          <p className="text-muted">
            Full-stack TypeScript. Fastify 5 API with Prisma ORM on PostgreSQL.
            Next.js 16 frontend with React 19 and wagmi. Redis for discovery caching.
            The CEX relay is a standalone Express service on Railway that signs
            per-user Binance, Bybit, Coinbase and OKX requests and returns provider
            price data when the API datacenter IP is blocked. Deployed on Railway with automated Docker builds.
          </p>
          <p className="text-muted mt-2">
            Follow updates on <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">RPC resilience</h2>
          <p className="text-muted text-xs mb-3">
            Eleven defense layers keep scans fast and accurate even when public RPCs go down.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2"><span className="text-accent">🛡️</span><span className="text-muted text-xs"><strong className="text-fg">Dead-chain filter</strong>. 8 chains with 0 live RPCs are auto-skipped (config preserved for reactivation).</span></div>
            <div className="flex gap-2"><span className="text-accent">📡</span><span className="text-muted text-xs"><strong className="text-fg">Per-endpoint health</strong>. RPCs are scored and decay in 60s when they fail. Only healthy endpoints participate in consensus.</span></div>
            <div className="flex gap-2"><span className="text-accent">✅</span><span className="text-muted text-xs"><strong className="text-fg">Strict consensus</strong>. A balance needs a strict majority of healthy RPCs to be trusted. Cached values never override confirmed consensus.</span></div>
            <div className="flex gap-2"><span className="text-accent">⏱️</span><span className="text-muted text-xs"><strong className="text-fg">Per-chain timeout</strong>. 90s per chain + 30min hard cap on the whole job. Stuck chains do not block the rest.</span></div>
            <div className="flex gap-2"><span className="text-accent">🌐</span><span className="text-muted text-xs"><strong className="text-fg">Chainlist fallback</strong>. When a static RPC fails, the engine consults chainlist.org and validates the candidate with eth_chainId before adopting it.</span></div>
            <div className="flex gap-2"><span className="text-accent">🔁</span><span className="text-muted text-xs"><strong className="text-fg">Snapshot cache</strong>. Each scan result is cached in Redis. A force-refresh skips the cache and rebuilds from the live chain.</span></div>
            <div className="flex gap-2"><span className="text-accent">📦</span><span className="text-muted text-xs"><strong className="text-fg">Multicall3 batching</strong>. All ERC-20 balances fetched in a single RPC call per chain instead of N individual calls.</span></div>
            <div className="flex gap-2"><span className="text-accent">🔍</span><span className="text-muted text-xs"><strong className="text-fg">Live audit</strong>. <code>scripts/audit-rpcs.mjs</code> probes every static RPC in 4s and reports the dead, single and half-dead pools.</span></div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">Limitations</h2>
          <ul className="space-y-1 text-muted list-disc list-inside text-xs">
            <li>Very new or obscure tokens may lack accurate pricing</li>
            <li>Single-RPC chains are fragile. If the node goes down, scanning pauses</li>
            <li>Selected staking and lending positions are tracked; broad LP, vault, and protocol coverage remains incomplete</li>
            <li>On-chain GM deployment requires ETH on the target chain for gas</li>
            <li>CEX balances are read-only: no sync if the provider API is down and no trading surface</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">What's next</h2>
          <p className="text-muted text-xs mb-3">These are ideas for the future. Priorities may evolve based on user feedback.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2"><span className="text-accent">📊</span><span className="text-muted text-xs"><strong className="text-fg">Broader DeFi coverage</strong>. Expand beyond selected staking and lending positions to LPs, vaults, and more protocols.</span></div>
            <div className="flex gap-2"><span className="text-accent">🔍</span><span className="text-muted text-xs"><strong className="text-fg">Transaction history</strong>. Full transaction timeline across all chains and wallets.</span></div>
            <div className="flex gap-2"><span className="text-accent">📈</span><span className="text-muted text-xs"><strong className="text-fg">Portfolio charts</strong>. Historical value, allocation breakdowns, P&L tracking over time.</span></div>
            <div className="flex gap-2"><span className="text-accent">🔔</span><span className="text-muted text-xs"><strong className="text-fg">Price alerts</strong>. Notifications when tokens hit target prices or values change significantly.</span></div>
            <div className="flex gap-2"><span className="text-accent">📱</span><span className="text-muted text-xs"><strong className="text-fg">Mobile PWA</strong>. Installable app with offline cache and push notifications.</span></div>
            <div className="flex gap-2"><span className="text-accent">🌐</span><span className="text-muted text-xs"><strong className="text-fg">More chains</strong>. Continue expanding GM on-chain and wallet scan coverage to new mainnets.</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
