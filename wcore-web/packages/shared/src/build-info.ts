// Which commit a running image was built from. railway-deploy.mjs writes
// wcore-web/build-info.json into the upload and both Dockerfile.railway copy it to
// BUILD_INFO_PATH; GitHub-triggered Railway builds expose RAILWAY_GIT_COMMIT_SHA
// instead. A healthy 200 alone does not prove the intended code is the one serving.

export const BUILD_INFO_PATH = "/app/build-info/build-info.json";

export interface BuildIdentity {
  sha: string | null;
  source: "build-info" | "railway-git" | "conflict" | "unknown";
}

const SHA = /^[0-9a-f]{40}$/;

function shaFromFile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { schema?: unknown; sha?: unknown };
    return parsed.schema === 1 && typeof parsed.sha === "string" && SHA.test(parsed.sha) ? parsed.sha : null;
  } catch {
    return null;
  }
}

export function resolveBuildIdentity(fileContent: string | null | undefined, env: Record<string, string | undefined>): BuildIdentity {
  const fromFile = shaFromFile(fileContent);
  const fromRailway = env.RAILWAY_GIT_COMMIT_SHA && SHA.test(env.RAILWAY_GIT_COMMIT_SHA) ? env.RAILWAY_GIT_COMMIT_SHA : null;
  // Both present and different means the image cannot say which commit it runs.
  if (fromFile && fromRailway && fromFile !== fromRailway) return { sha: null, source: "conflict" };
  if (fromFile) return { sha: fromFile, source: "build-info" };
  if (fromRailway) return { sha: fromRailway, source: "railway-git" };
  return { sha: null, source: "unknown" };
}
