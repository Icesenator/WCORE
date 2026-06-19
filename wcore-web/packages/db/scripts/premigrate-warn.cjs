// Pre-migration safety check — prevents accidental data loss
const { execSync } = require('child_process');
const path = require('path');

const psScript = path.join(__dirname, 'backup-db.ps1');

console.log('\n⚠️  WARNING: prisma migrate dev can RESET your database and DELETE ALL DATA.');
console.log('⚠️  If your database has data created via "prisma db push", it will be wiped.\n');

try {
  execSync('docker exec wcore-postgres psql -U wcore -d wcore -c "SELECT count(*) FROM users"', { stdio: 'pipe' });
} catch {
  console.log('PostgreSQL not reachable — skipping backup check.\n');
  process.exit(0);
}

console.log('📦 Backing up database before migration...');
try {
  execSync(`powershell -File "${psScript}"`, { stdio: 'inherit' });
  console.log('✅ Backup completed. Proceeding with migration...\n');
} catch {
  console.error('❌ Backup failed. Migration aborted.\n');
  process.exit(1);
}
