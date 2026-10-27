// DRAFT, NOT APPLIED. Railway Infrastructure as Code for the three services this
// repository builds (docs/cloud/RAILWAY_CONFIG_MIGRATION.md).
//
// Deliberately kept out of .railway/: Railway reads .railway/railway.ts only through
// `railway config plan|apply`, and this draft is incomplete until it is reconciled with
// `railway config pull` (see the protocol). Never run `railway config apply` or
// `railway config migrate --apply` from it without a separate authorization.
//
// Scope: a named partial that declares only api, web and cex-relay. Partials manage only
// the resources they declare, so PostgreSQL, Redis, volumes, other services, variables and
// secrets stay outside this file and untouched by its plan.
import { defineRailway, project, service } from "railway/iac";

export const partial = "wcore-root";

export default defineRailway(() => {
  // Build settings today (wcore-web/railway/api.json): Dockerfile
  // wcore-web/apps/api/Dockerfile.railway, repository root as build context, watch
  // patterns as listed there. The IaC reference documents no field for a Dockerfile path or
  // watch patterns: copy them from the output of `railway config pull`, never guess them.
  const api = service("api", {
    healthcheck: "/health",
    healthcheckTimeout: 120,
  });

  // Today: wcore-web/railway/web.json (Dockerfile wcore-web/apps/web/Dockerfile.railway).
  const web = service("web", {
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
  });

  // Today: wcore-web/railway/cex-relay.json (Dockerfile wcore-gsheet/railway-relay/Dockerfile).
  // No healthcheck is declared for it today; none is added here.
  const cexRelay = service("cex-relay", {});

  // The project name comes from `railway config pull`; this placeholder makes a plan fail.
  return project("REPLACE_WITH_PULLED_PROJECT_NAME", {
    resources: [api, web, cexRelay],
  });
});
