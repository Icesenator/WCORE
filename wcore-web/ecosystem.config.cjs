// pm2 process supervisor for WCORE staging — replaces the PowerShell
// Start-Job pair in scripts/deploy-staging.ps1, which dies with the host
// shell session.
//
// Usage (after `npm i -g pm2`):
//   pm2 start ecosystem.config.cjs
//   pm2 logs wcore-staging-api
//   pm2 save               # persist the process list
//   pm2 startup            # generate the boot service hook (Linux only)
//
// Env required: DATABASE_URL, REDIS_HOST, REDIS_PORT, JWT_SECRET, CORS_ORIGIN.
// On Windows, prefer `pm2-runtime` under nssm or run via WSL2 — pm2 startup
// is Linux-only.

const path = require("node:path");
const root = __dirname;

module.exports = {
  apps: [
    {
      name: "wcore-staging-api",
      cwd: root,
      script: "node_modules/tsx/dist/cli.mjs",
      args: ["apps/api/src/server.ts"],
      // tsx loads .ts directly — fine for staging. For production prefer a
      // real build pipeline that emits compiled JS.
      interpreter: "node",
      env: {
        NODE_ENV: "staging",
        HOST: "127.0.0.1",
        PORT: "4001",
        RATE_LIMIT_SCAN: "60",
        RATE_LIMIT_AUTH: "30",
        MAX_CHAINS_PER_SCAN: "120",
        // Set to "true" only when a reverse proxy (nginx, Caddy) is actually
        // in front of Fastify. Misconfiguring this lets clients spoof their
        // own IP via X-Forwarded-For.
        TRUST_PROXY: process.env.TRUST_PROXY ?? "false",
      },
      // Restart policy.
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: 10_000,
      // 768MB matches the API's hot path memory ceiling under heavy scan
      // load with c=20. Bump if SCAN_CONCURRENCY is raised.
      max_memory_restart: "768M",
      // Logs.
      out_file: path.join(root, ".pm2-logs", "api-out.log"),
      error_file: path.join(root, ".pm2-logs", "api-err.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "wcore-staging-web",
      cwd: root,
      // Next standalone server. Build with `pnpm --filter @wcore/web build`
      // and ensure deploy-staging.ps1 has copied .next/static into place.
      script: "apps/web/.next/standalone/apps/web/server.js",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3001",
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001",
      },
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: 10_000,
      max_memory_restart: "512M",
      out_file: path.join(root, ".pm2-logs", "web-out.log"),
      error_file: path.join(root, ".pm2-logs", "web-err.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
