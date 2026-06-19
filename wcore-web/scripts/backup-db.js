/**
 * WCORE Database Backup
 * Uses native pg_dump for reliable, schema-complete SQL dumps.
 * Keeps last 7 daily backups, auto-rotates older ones.
 *
 * Usage: node scripts/backup-db.js
 * Schedule: daily via Windows Task Scheduler or cron
 *
 * Requires: pg_dump in PATH (PostgreSQL client tools)
 * Env: BACKUP_DATABASE_URL or scripts/.env.backup with DATABASE_URL
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BACKUP_DIR = path.join(__dirname, "..", "backups");
const KEEP_DAYS = 7;

// Resolve DATABASE_URL from env or local .env file
let dbUrl = process.env.BACKUP_DATABASE_URL;
if (!dbUrl) {
  const envPath = path.join(__dirname, ".env.backup");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) dbUrl = match[1].trim();
  }
}
if (!dbUrl) {
  console.error("FATAL: BACKUP_DATABASE_URL must be set or scripts/.env.backup must contain DATABASE_URL");
  process.exit(1);
}

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const fileName = `wcore-backup-${timestamp}.sql`;
const filePath = path.join(BACKUP_DIR, fileName);

console.log("=== WCORE DB Backup (pg_dump) ===\n");
console.log(`Output: ${filePath}`);

try {
  // pg_dump with clean inserts, no owner/privileges (portable across environments)
  execSync(
    `pg_dump "${dbUrl}" --no-owner --no-privileges --no-comments --clean --if-exists --format=plain --file="${filePath}"`,
    { stdio: "inherit", timeout: 300_000 }
  );

  const size = fs.statSync(filePath).size;
  console.log(`\nBackup saved: ${filePath}`);
  console.log(`Size: ${(size / 1024).toFixed(1)} KB`);

  // Rotate: delete backups older than KEEP_DAYS
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("wcore-backup-") && f.endsWith(".sql"))
    .sort();

  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let deleted = 0;
  for (const f of files) {
    const fullPath = path.join(BACKUP_DIR, f);
    if (fs.statSync(fullPath).mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      deleted++;
    }
  }
  if (deleted > 0) {
    console.log(`Rotated: ${deleted} old backup(s) deleted (keeping last ${KEEP_DAYS} days)`);
  }

  console.log("\n=== Backup Complete ===");
} catch (e) {
  console.error("FATAL: pg_dump failed:", e.message);
  // Clean up partial file
  try { fs.unlinkSync(filePath); } catch {}
  process.exit(1);
}
