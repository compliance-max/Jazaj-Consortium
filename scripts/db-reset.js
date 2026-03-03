const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio || 'inherit',
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getDatabaseName(databaseUrl) {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('DATABASE_URL must include a database name');
  return dbName;
}

function detectPostgresContainer() {
  if (process.env.POSTGRES_CONTAINER) return process.env.POSTGRES_CONTAINER;
  const project = path.basename(process.cwd());
  return `${project}-postgres-1`;
}

loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const dbName = getDatabaseName(databaseUrl);
const dbUser = process.env.POSTGRES_USER || 'postgres';
const container = detectPostgresContainer();
const quotedDbName = quoteIdent(dbName);

console.log(`Resetting database ${dbName} using migration-first workflow...`);
run('docker', [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  dbUser,
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  `DROP DATABASE IF EXISTS ${quotedDbName} WITH (FORCE);`,
  '-c',
  `CREATE DATABASE ${quotedDbName};`
]);

run('npx', ['prisma', 'migrate', 'deploy']);
run('npm', ['run', 'seed:demo']);

console.log('db:reset complete.');
