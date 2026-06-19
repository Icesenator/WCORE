// Restore WCORE DB from SQL backup
// Usage: cd apps/api && DATABASE_URL=... pnpm exec tsx restore-db.cjs <backup.sql>
// Only restores data for the platform owner address to avoid conflicts.

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const OWNER = '0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('FATAL: DATABASE_URL not set'); process.exit(1); }

const backupFile = process.argv[2];
if (!backupFile) { console.error('Usage: pnpm exec tsx restore-db.cjs <backup.sql>'); process.exit(1); }

const p = new PrismaClient({ datasourceUrl: dbUrl });

function parseSqlValue(val) {
  if (val === 'NULL') return null;
  if (val === 'TRUE') return true;
  if (val === 'FALSE') return false;
  if (/^'/.test(val)) return val.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

function parseInsertLine(line) {
  // INSERT INTO "table" ("col1", "col2") VALUES ('val1', 'val2'), ('val3', 'val4');
  const tableMatch = line.match(/INSERT INTO "(\w+)"/);
  if (!tableMatch) return null;
  const table = tableMatch[1];

  const colsMatch = line.match(/\(([^)]+)\)\s+VALUES\s+(.+)/i);
  if (!colsMatch) return null;

  const cols = colsMatch[1].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const valuesStr = colsMatch[2];

  // Parse each VALUES tuple
  const rows = [];
  const tupleRegex = /\(([^)]*)\)/g;
  let match;
  while ((match = tupleRegex.exec(valuesStr)) !== null) {
    // Split by comma but respect quoted strings
    const rawVals = [];
    let current = '';
    let inQuote = false;
    for (const ch of match[1]) {
      if (ch === "'" && !inQuote) { inQuote = true; current += ch; }
      else if (ch === "'" && inQuote) { inQuote = false; current += ch; }
      else if (ch === ',' && !inQuote) { rawVals.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) rawVals.push(current.trim());

    const row = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]] = parseSqlValue(rawVals[i] || 'NULL');
    }
    rows.push(row);
  }

  return { table, rows };
}

(async () => {
  try {
    console.log('=== WCORE DB Restore ===');
    console.log(`Backup: ${backupFile}`);
    console.log(`Target: ${dbUrl.split('@')[1] || dbUrl}`);
    console.log(`Owner: ${OWNER}`);

    const sql = fs.readFileSync(backupFile, 'utf8');
    const lines = sql.split('\n').filter(l => l.startsWith('INSERT INTO'));

    // Find owner ID from users table
    let ownerId = null;
    for (const line of lines) {
      if (line.includes('"users"') && line.includes(OWNER.toLowerCase())) {
        const parsed = parseInsertLine(line);
        if (parsed) {
          const userRow = parsed.rows[0];
          ownerId = userRow.id;
          console.log(`\nFound owner in backup: ID=${ownerId}, address=${userRow.address}`);
          console.log(`  streak=${userRow.gmStreak}, score=${userRow.score}, plan=${userRow.plan}`);
        }
        break;
      }
    }

    if (!ownerId) {
      console.error('ERROR: Owner user not found in backup');
      process.exit(1);
    }

    // Check if owner already exists in DB
    const existingUser = await p.user.findUnique({ where: { address: OWNER.toLowerCase() } });
    if (existingUser) {
      console.log(`\nOwner already exists in DB with ID: ${existingUser.id}`);
      // Use existing ID for FK references
      ownerId = existingUser.id;
    }

    // Restore user
    console.log('\n--- Restoring user ---');
    await p.user.upsert({
      where: { address: OWNER.toLowerCase() },
      update: {
        gmStreak: 11, score: 1338, plan: 'admin', longestStreak: 11,
        lastGmDate: new Date('2026-05-17T14:44:49.000Z'),
        referralCode: '17d51873', referralEarnings: 1,
        welcomeCompleted: true, referredById: ownerId,
      },
      create: {
        id: ownerId, address: OWNER.toLowerCase(),
        gmStreak: 11, score: 1338, plan: 'admin', longestStreak: 11,
        lastGmDate: new Date('2026-05-17T14:44:49.000Z'),
        referralCode: '17d51873', referralEarnings: 1,
        welcomeCompleted: true, referredById: ownerId,
      },
    });
    console.log('  User restored');

    // Restore GM contracts (all owned by this user)
    console.log('\n--- Restoring GM contracts ---');
    let contractCount = 0;
    for (const line of lines) {
      if (!line.includes('"gm_contracts"')) continue;
      const parsed = parseInsertLine(line);
      if (!parsed) continue;

      for (const row of parsed.rows) {
        if (row.creatorAddress?.toLowerCase() !== OWNER.toLowerCase()) continue;
        try {
          await p.gmContract.upsert({
            where: { chainKey_contractAddress: { chainKey: row.chainKey, contractAddress: row.contractAddress } },
            update: { creatorAddress: row.creatorAddress, ownerId: ownerId, deployTxHash: row.deployTxHash || null },
            create: {
              id: row.id, chainKey: row.chainKey, contractAddress: row.contractAddress,
              creatorAddress: row.creatorAddress, ownerId: ownerId, deployTxHash: row.deployTxHash || null,
            },
          });
          contractCount++;
        } catch (e) {
          if (!e.message?.includes('Unique constraint')) console.error(`  Error on ${row.chainKey}: ${e.message}`);
        }
      }
    }
    console.log(`  ${contractCount} GM contracts restored`);

    console.log('\n=== Restore complete ===');
    console.log('Reconnect via the frontend to verify your account.');
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
