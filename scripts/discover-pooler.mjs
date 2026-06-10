import dns from 'node:dns';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read DATABASE_URL from .env.local and derive project ref + password
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!envMatch) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}
const DATABASE_URL_FULL = envMatch[1].trim();

// Parse project ref and password from DATABASE_URL
// Format: postgresql://postgres.<project_ref>:<password>@<host>:<port>/<db>
const urlMatch = DATABASE_URL_FULL.match(/^postgresql:\/\/postgres\.([^:]+):([^@]+)@/);
if (!urlMatch) {
  console.error('Could not parse project ref / password from DATABASE_URL');
  process.exit(1);
}
const PROJECT_REF = urlMatch[1];
const DB_PASSWORD = urlMatch[2];

const PREFIXES = ['aws-0', 'aws-1'];
const REGIONS = [
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
  'sa-east-1', 'ca-central-1',
];

async function dnsLookup(host) {
  try {
    await dns.promises.lookup(host);
    return true;
  } catch {
    return false;
  }
}

async function testConnection(host) {
  const client = new Client({
    connectionString: `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@${host}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    return { success: true };
  } catch (err) {
    try { await client.end(); } catch {}
    return { success: false, error: err.message };
  }
}

async function discover() {
  const resolvedButFailed = [];

  for (const prefix of PREFIXES) {
    for (const region of REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      process.stdout.write(`Checking DNS: ${host} ... `);

      const resolves = await dnsLookup(host);
      if (!resolves) {
        process.stdout.write('no DNS\n');
        continue;
      }

      process.stdout.write('DNS OK, testing connection ... ');
      const result = await testConnection(host);

      if (result.success) {
        console.log('SUCCESS!');
        console.log(`\nDISCOVERED WORKING HOST: ${host}`);
        console.log(`CONNECTION STRING: postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@${host}:5432/postgres`);
        return host;
      } else {
        console.log(`FAILED: ${result.error}`);
        resolvedButFailed.push({ host, error: result.error });
      }
    }
  }

  console.error('\nBLOCKED: No working pooler host found.');
  if (resolvedButFailed.length > 0) {
    console.error('Hosts that resolved but failed:');
    for (const { host, error } of resolvedButFailed) {
      console.error(`  ${host}: ${error}`);
    }
  } else {
    console.error('No hosts resolved via DNS at all.');
  }
  return null;
}

const workingHost = await discover();
if (!workingHost) {
  process.exit(1);
}
