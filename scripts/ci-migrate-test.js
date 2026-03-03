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
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: options.stdio || 'inherit',
    env: options.env || process.env,
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function withDatabase(urlString, databaseName, schemaName = 'public') {
  const url = new URL(urlString);
  url.pathname = `/${databaseName}`;
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

function makeTempDbName() {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `consortium_ci_${stamp}_${rand}`;
}

function detectPostgresContainer() {
  if (process.env.POSTGRES_CONTAINER) return process.env.POSTGRES_CONTAINER;
  const project = path.basename(process.cwd());
  return `${project}-postgres-1`;
}

function runDockerPsql(sqlStatements) {
  const dbUser = process.env.POSTGRES_USER || 'postgres';
  const container = detectPostgresContainer();
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    dbUser,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1'
  ];
  for (const sql of sqlStatements) {
    args.push('-c', sql);
  }
  run('docker', args);
}

loadDotEnv();

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL is required for ci:migrate:test');
  process.exit(1);
}

const tempDb = makeTempDbName();
const deployUrl = withDatabase(baseUrl, tempDb, 'public');
const testUrl = withDatabase(baseUrl, tempDb, 'vitest');

console.log(`Using temporary database: ${tempDb}`);

try {
  runDockerPsql([
    `DROP DATABASE IF EXISTS ${quoteIdent(tempDb)} WITH (FORCE);`,
    `CREATE DATABASE ${quoteIdent(tempDb)};`
  ]);

  run('npx', ['prisma', 'migrate', 'deploy'], {
    env: {
      ...process.env,
      DATABASE_URL: deployUrl
    }
  });

  run('npx', ['prisma', 'generate'], {
    env: {
      ...process.env,
      DATABASE_URL: deployUrl
    }
  });

  run('npm', ['test'], {
    env: {
      ...process.env,
      TEST_DATABASE_URL: testUrl
    }
  });

  console.log('ci:migrate:test passed.');
} finally {
  try {
    runDockerPsql([`DROP DATABASE IF EXISTS ${quoteIdent(tempDb)} WITH (FORCE);`]);
  } catch (cleanupError) {
    console.error(`Warning: failed to drop temporary database ${tempDb}:`, cleanupError.message);
  }
}
