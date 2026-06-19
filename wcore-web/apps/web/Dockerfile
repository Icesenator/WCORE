FROM node:22-alpine AS builder

# CACHE_BUST=2026-05-30-audit-deploy
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY pnpm-workspace.yaml tsconfig.base.json package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.mjs apps/web/postcss.config.mjs apps/web/tailwind.config.ts apps/web/

RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WC_PROJECT_ID=3090760ada2bf4a459a27506fcdc16ec
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WC_PROJECT_ID=${NEXT_PUBLIC_WC_PROJECT_ID}

# Copy all source files in one layer (changes here invalidate all subsequent layers)
COPY packages/shared/src packages/shared/src
COPY packages/core/src packages/core/src
COPY apps/web/app apps/web/app
COPY apps/web/components apps/web/components
COPY apps/web/hooks apps/web/hooks
COPY apps/web/lib apps/web/lib
COPY apps/web/public apps/web/public

# Force cache invalidation: $(date +%s) produces unique output every build
RUN echo "BUILD_TS $(date +%s)"

RUN pnpm --filter "@wcore/shared" build
RUN pnpm --filter "@wcore/core" build
RUN pnpm --filter "@wcore/web" build

FROM node:22-alpine AS runner

WORKDIR /app
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT:-3000}
ENV HOSTNAME=0.0.0.0

COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public

# Run as non-root (node:alpine ships an unprivileged `node` user, uid 1000).
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "const http=require('http');const port=process.env.PORT||3000;const req=http.get('http://127.0.0.1:'+port,{timeout:4000},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{process.exit(r.statusCode===200&&d.includes('WCORE')?0:1)});});req.on('timeout',()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"

CMD ["node", "apps/web/server.js"]
