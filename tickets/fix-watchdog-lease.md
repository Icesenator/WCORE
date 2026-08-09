---
type: ticket
status: open
priority: high
project: WCORE
date: 2026-07-20
---

# Fix: Watchdog lease timeout after 5 stale cycles

The watchdog at `WCORE/wcore-gsheet/src/16_REFRESH.gs` sometimes gets stuck after 5 consecutive stale rows. Root cause might be the lease expiry check in `releaseLease()`.

## Steps

- [ ] Add debug logging to `releaseLease()`
- [ ] Test with 6 stale rows
- [ ] Verify auto-recovery within 2 cycles
