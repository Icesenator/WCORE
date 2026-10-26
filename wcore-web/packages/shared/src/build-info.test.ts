import { describe, expect, test } from "vitest";
import { resolveBuildIdentity } from "./build-info";

const A = "a".repeat(40);
const B = "b".repeat(40);
const file = (sha: unknown, schema: unknown = 1) => JSON.stringify({ schema, sha, ref: "origin/master", service: "api" });

describe("resolveBuildIdentity", () => {
  test("prefers the deploy-time build-info file", () => {
    expect(resolveBuildIdentity(file(A), {})).toEqual({ sha: A, source: "build-info" });
  });

  test("falls back to the commit of a GitHub-triggered Railway build", () => {
    expect(resolveBuildIdentity(null, { RAILWAY_GIT_COMMIT_SHA: B })).toEqual({ sha: B, source: "railway-git" });
  });

  test("reports a conflict instead of picking one when the two disagree", () => {
    expect(resolveBuildIdentity(file(A), { RAILWAY_GIT_COMMIT_SHA: B })).toEqual({ sha: null, source: "conflict" });
    expect(resolveBuildIdentity(file(A), { RAILWAY_GIT_COMMIT_SHA: A })).toEqual({ sha: A, source: "build-info" });
  });

  test("never reports a malformed or partial value as a commit", () => {
    for (const raw of ["not json", file("abc"), file(A.toUpperCase()), file(A, 2), file(42), "", undefined]) {
      expect(resolveBuildIdentity(raw, { RAILWAY_GIT_COMMIT_SHA: "main" })).toEqual({ sha: null, source: "unknown" });
    }
  });
});
