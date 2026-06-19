// WCORE DB Backup — run from apps/api directory
// Usage: cd apps/api && DATABASE_URL=... pnpm exec tsx backup-db.cjs
// Requires: DATABASE_URL env var

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const p = new PrismaClient({ datasourceUrl: dbUrl });

const outDir = path.join(__dirname, '..', '..', 'backups');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `wcore-backup-${timestamp}.json`);

(async () => {
  try {
    console.log('=== WCORE DB Backup (Prisma) ===');
    console.log(`Output: ${outFile}`);

    const backup = { timestamp: new Date().toISOString(), tables: {} };

    const tables = [
      'user', 'linkedWallet', 'walletScan', 'onchainGm', 'userChainGm',
      'gmContract', 'customToken', 'notification', 'quest', 'userQuest',
      'badge', 'userBadge', 'opsEvent', 'systemMetricSnapshot',
      'scamOverride', 'shareToken',
    ];

    for (const table of tables) {
      try {
        const model = p[table];
        if (!model) continue;
        const rows = await model.findMany();
        backup.tables[table] = rows;
        console.log(`  ${table}: ${rows.length} rows`);
      } catch (e) {
        console.log(`  ${table}: SKIP (${e.message})`);
      }
    }

    fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));
    console.log(`Backup complete: ${outFile}`);

    // Cleanup old backups (keep last 7)
    const files = fs.readdirSync(outDir).filter(f => f.startsWith('wcore-backup')).sort().reverse();
    for (const old of files.slice(7)) {
      fs.unlinkSync(path.join(outDir, old));
      console.log(`Deleted old backup: ${old}`);
    }
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
