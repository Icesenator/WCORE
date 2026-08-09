import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DependencyTransitionTracker, dependencyHealthStatus } from "./plugins/admin.js";

describe("API dependency health", () => {
  test("Redis failure degrades status even when the database is healthy", () => {
    assert.equal(dependencyHealthStatus(true, false, 0), "degraded");
    assert.equal(dependencyHealthStatus(false, true, 0), "down");
    assert.equal(dependencyHealthStatus(true, true, 1), "degraded");
  });

  test("dependency alerts and ops events are emitted once per transition", async () => {
    const events: string[] = [];
    const alerts: string[] = [];
    const tracker = new DependencyTransitionTracker({
      recordOpsEvent: async (type) => { events.push(type); },
      sendAlert: async (alert) => { alerts.push(alert.type); },
    });

    await tracker.observe({ db: true, redis: true });
    await tracker.observe({ db: true, redis: false });
    await tracker.observe({ db: true, redis: false });
    await tracker.observe({ db: true, redis: true });

    assert.deepEqual(events, ["redis_down", "redis_recovered"]);
    assert.deepEqual(alerts, events);
  });

  test("an initially unavailable dependency emits a down transition", async () => {
    const events: string[] = [];
    const tracker = new DependencyTransitionTracker({
      recordOpsEvent: async (type) => { events.push(type); },
      sendAlert: async () => {},
    });

    await tracker.observe({ db: false, redis: true });
    assert.deepEqual(events, ["db_down"]);
  });
});
