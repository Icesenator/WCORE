// WCORE DB Backup — run from apps/api directory
// Usage: cd apps/api && DATABASE_URL=... pnpm exec tsx backup-db.cjs
// Requires: DATABASE_URL env var

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const BACKUP_MODELS = [
  'user', 'linkedWallet', 'walletScan', 'scanJob', 'cexAccount', 'cexHolding',
  'quest', 'userQuest', 'badge', 'userBadge', 'customToken', 'scamOverride',
  'gmContract', 'onchainGm', 'userChainGm', 'notification', 'ticket',
  'systemMetricSnapshot', 'opsEvent',
];

async function collectBackup(client, timestamp = new Date().toISOString(), onModel = () => {}) {
  const backup = { timestamp, tables: {} };
  for (const modelName of BACKUP_MODELS) {
    const model = client[modelName];
    if (!model || typeof model.findMany !== 'function') {
      throw new Error(`Prisma model unavailable: ${modelName}`);
    }
    try {
      const rows = await model.findMany();
      backup.tables[modelName] = rows;
      onModel(modelName, rows.length);
    } catch (error) {
      throw new Error(`Backup query failed for ${modelName}: ${error.message}`, { cause: error });
    }
  }
  return backup;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const p = new PrismaClient({ datasourceUrl: dbUrl });
  const outDir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `wcore-backup-${timestamp}.json`);
  const tempFile = `${outFile}.tmp`;

  try {
    console.log('=== WCORE DB Backup (Prisma) ===');
    console.log(`Output: ${outFile}`);

    const backup = await collectBackup(p, new Date().toISOString(), (modelName, count) => {
      console.log(`  ${modelName}: ${count} rows`);
    });
    fs.writeFileSync(tempFile, JSON.stringify(backup, null, 2));
    fs.renameSync(tempFile, outFile);
    console.log(`Backup complete: ${outFile}`);

    // Cleanup old backups (keep last 7)
    const files = fs.readdirSync(outDir).filter(f => f.startsWith('wcore-backup')).sort().reverse();
    for (const old of files.slice(7)) {
      fs.unlinkSync(path.join(outDir, old));
      console.log(`Deleted old backup: ${old}`);
    }
  } catch (e) {
    try { fs.unlinkSync(tempFile); } catch { /* no temporary file to remove */ }
    console.error('FATAL:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
}

module.exports = { BACKUP_MODELS, collectBackup };

if (require.main === module) {
  main().catch((error) => {
    console.error('FATAL:', error.message);
    process.exitCode = 1;
  });
}
