import { readFileSync } from "node:fs";
import { BUILD_INFO_PATH, resolveBuildIdentity, type BuildIdentity } from "@wcore/shared";

export interface WebHealth {
  status: "ok";
  service: "wcore-web";
  build: BuildIdentity;
}

function readBuildInfo(path: string): string | null {
  try {
    // Runtime file written into the image by Dockerfile.railway; not part of the trace.
    return readFileSync(/* turbopackIgnore: true */ path, "utf8");
  } catch {
    return null;
  }
}

// Liveness only: no dependency is probed, so a slow API never restarts the web container.
export function webHealth(env: Record<string, string | undefined> = process.env, path: string = BUILD_INFO_PATH): WebHealth {
  return { status: "ok", service: "wcore-web", build: resolveBuildIdentity(readBuildInfo(path), env) };
}
