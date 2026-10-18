// One command for the whole local stack:
//   npm start            — Docker (started if it is off), PostgreSQL, MinIO, Mailpit, media worker, migrations,
//                          first-run seed and CMS admin, then API and web with a watchdog that restarts them
//   npm start -- --open  — also opens the site in the browser when it is ready (start.cmd passes it)
//   npm run stop         — stops the dev servers and the containers (data stays in Docker volumes)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const win = process.platform === 'win32';

const API_PORT = 4360;
const WEB_PORT = 3360;
const API_HEALTH = `http://localhost:${API_PORT}/api/health`;
const SITE = `http://localhost:${WEB_PORT}`;
/** Ports of a previous run (dev servers left behind by a closed terminal) */
const DEV_PORTS = [API_PORT, WEB_PORT];
/** The running launcher, so `npm run stop` or a second start can end it (its watchdog would bring the servers back) */
const PID_FILE = resolve(root, 'node_modules/.cache/loci360-start.pid');

const paint = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = paint('2');
const red = paint('31');
const green = paint('32');
const bold = paint('1');
const step = (s) => console.log(`${bold('›')} ${s}`);
const fail = (s) => {
  console.error(red(`✖ ${s}`));
  process.exit(1);
};

/**
 * Runs a command to the end with its output in the console; returns the exit code.
 * Only npm needs a shell on Windows (it is npm.cmd); other commands get their arguments unquoted and intact.
 */
function run(cmd, cmdArgs, opts = {}) {
  const shell = win && cmd === 'npm';
  const r = shell
    ? spawnSync([cmd, ...cmdArgs].join(' '), { cwd: root, stdio: opts.quiet ? 'pipe' : 'inherit', shell: true, encoding: 'utf8' })
    : spawnSync(cmd, cmdArgs, { cwd: root, stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  return opts.quiet ? { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } : r.status ?? 1;
}
const must = (cmd, cmdArgs, what) => run(cmd, cmdArgs) === 0 || fail(`${what} не удалось — см. вывод выше`);

async function httpOk(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ processes on our ports

function pidsOnPort(port) {
  if (win) {
    const { out } = run('netstat', ['-ano', '-p', 'tcp'], { quiet: true });
    return [
      ...new Set(
        out
          .split(/\r?\n/)
          .filter((l) => /LISTENING/.test(l) && new RegExp(`[:.]${port}\\s`).test(l))
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && p !== '0'),
      ),
    ];
  }
  const { out } = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { quiet: true });
  return out.split(/\s+/).filter(Boolean);
}

function killTree(pid) {
  if (win) run('taskkill', ['/PID', String(pid), '/T', '/F'], { quiet: true });
  else {
    try {
      process.kill(-Number(pid), 'SIGTERM');
    } catch {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
}

/** True when the process is a launcher of this project (guards against a recycled PID) */
function isLauncher(pid) {
  const { out } = win
    ? run('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { quiet: true })
    : run('ps', ['-p', String(pid), '-o', 'command='], { quiet: true });
  return /scripts[\\/]start\.mjs/.test(out);
}

function stopPreviousLauncher() {
  let pid = 0;
  try {
    pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  } catch {
    return;
  }
  if (pid && pid !== process.pid && isLauncher(pid)) {
    console.log(dim(`  останавливаю прошлый запуск (процесс ${pid})`));
    killTree(pid);
  }
  rmSync(PID_FILE, { force: true });
}

function freePorts() {
  for (const port of DEV_PORTS) {
    for (const pid of pidsOnPort(port)) {
      console.log(dim(`  порт ${port} занят процессом ${pid} от прошлого запуска — останавливаю`));
      killTree(pid);
    }
  }
}

// ------------------------------------------------------------------ stop

if (args.has('--stop')) {
  step('Останавливаю API и сайт');
  stopPreviousLauncher();
  freePorts();
  step('Останавливаю контейнеры (данные остаются)');
  run('docker', ['compose', 'stop']);
  console.log(green('Готово'));
  process.exit(0);
}

// ------------------------------------------------------------------ prerequisites

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) fail(`Нужен Node.js 22 или новее, сейчас ${process.versions.node}`);

if (!existsSync(resolve(root, '.env'))) {
  step('Первый запуск: создаю .env со случайными паролями');
  must('node', ['scripts/env-init.mjs'], 'Создание .env');
}
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

// Dependencies: missing, or package-lock.json changed after the last install (e.g. after git pull)
const lock = resolve(root, 'package-lock.json');
const installed = resolve(root, 'node_modules/.package-lock.json');
if (!existsSync(installed) || statSync(lock).mtimeMs > statSync(installed).mtimeMs + 1000) {
  step('Ставлю зависимости (npm install)');
  must('npm', ['install'], 'npm install');
}

// ------------------------------------------------------------------ Docker

async function ensureDocker() {
  if (run('docker', ['info'], { quiet: true }).code === 0) return;
  step('Docker не запущен — запускаю Docker Desktop');
  if (win) {
    const exe = [process.env.ProgramFiles, process.env.ProgramW6432, 'C:\\Program Files']
      .filter(Boolean)
      .map((p) => resolve(p, 'Docker', 'Docker', 'Docker Desktop.exe'))
      .find((p) => existsSync(p));
    if (!exe) fail('Docker Desktop не найден. Установите его: https://www.docker.com/products/docker-desktop/');
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    fail('Docker не запущен: sudo systemctl start docker');
  }
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    if (run('docker', ['info'], { quiet: true }).code === 0) return;
  }
  fail('Docker не запустился за 3 минуты — откройте Docker Desktop вручную и повторите');
}

await ensureDocker();
step('PostgreSQL, MinIO, Mailpit');
must('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'minio', 'mailpit'], 'Запуск контейнеров');
must('docker', ['compose', 'up', '-d', 'minio-init'], 'Создание бакетов');
step('Обработчик медиа (собирается только при изменениях)');
must('docker', ['compose', 'up', '-d', '--build', 'worker'], 'Запуск обработчика');

// ------------------------------------------------------------------ database

step('Миграции базы');
must('npm', ['run', 'db:deploy', '--silent'], 'Миграции');

const psql = (sql) =>
  run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB, '-Atc', sql], { quiet: true });
const count = (table) => Number(psql(`select count(*) from "${table}"`).out.trim().split(/\s+/).pop());

if (count('Location') === 0) {
  step('Пустая база: заполняю жанры, кластеры, демо-локации и страницы');
  must('npm', ['run', 'db:seed', '--silent'], 'Заполнение базы');
}
if (count('User') === 0) {
  const email = 'admin@loci360.kz';
  const password = randomBytes(12).toString('base64url');
  step('Создаю администратора CMS');
  must('npm', ['run', 'admin:create', '--silent', '--', email, 'Admin', password, 'ADMIN'], 'Создание администратора');
  // .env is git-ignored: the first password is kept there so it is not lost with the console
  appendFileSync(resolve(root, '.env'), `\n# First CMS admin created by npm start (change the password in the CMS → Account)\n# ${email} / ${password}\n`);
  console.log(bold(`\n  Вход в CMS: ${email} / ${password}\n  (пароль также записан в конце .env)\n`));
}

// ------------------------------------------------------------------ API + web with a watchdog

stopPreviousLauncher();
freePorts();
mkdirSync(dirname(PID_FILE), { recursive: true });
writeFileSync(PID_FILE, String(process.pid));

const COLORS = { api: '36', web: '35' };
const children = new Map();
let stopping = false;

function startChild(name, script) {
  const opts = { cwd: root, detached: !win, env: { ...process.env, FORCE_COLOR: '1' } };
  const child = win ? spawn(`npm run ${script}`, { ...opts, shell: true }) : spawn('npm', ['run', script], opts);
  const tag = paint(COLORS[name])(`[${name}]`);
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk.toString()).split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (children.get(name)?.child !== child || stopping) return;
    console.log(red(`${tag} процесс завершился (код ${code}) — перезапускаю через 3 с`));
    setTimeout(() => !stopping && children.set(name, { ...children.get(name), child: startChild(name, script), since: Date.now(), misses: 0 }), 3000);
  });
  return child;
}

const SERVICES = [
  { name: 'api', script: 'dev:api', health: API_HEALTH, grace: 90_000 },
  // The dev server compiles the home page on the first request, which can take a while
  { name: 'web', script: 'dev:web', health: `${SITE}/`, grace: 180_000, timeout: 60_000 },
];
for (const s of SERVICES) children.set(s.name, { ...s, child: startChild(s.name, s.script), since: Date.now(), misses: 0 });

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log(dim('\nОстанавливаю API и сайт… (контейнеры продолжают работать, npm run stop — остановить всё)'));
  for (const { child } of children.values()) if (child?.pid) killTree(child.pid);
  rmSync(PID_FILE, { force: true });
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Wait until both answer, then tell where everything is
const t0 = Date.now();
while (!(await httpOk(API_HEALTH)) || !(await httpOk(`${SITE}/`, 60_000))) {
  if (Date.now() - t0 > 240_000) {
    console.log(red('API или сайт не отвечают 4 минуты — смотрите сообщения [api] / [web] выше'));
    break;
  }
  await sleep(2000);
}
if (Date.now() - t0 <= 240_000) {
  console.log(
    green(bold('\n  LOCI360 запущен')) +
      `\n  Сайт      ${SITE}` +
      `\n  CMS       ${SITE}/admin` +
      `\n  API       http://localhost:${API_PORT}/api` +
      `\n  Почта     http://localhost:${env.MAILPIT_UI_PORT || 58360}  (письма с сайта, Mailpit)` +
      `\n  Хранилище http://localhost:${env.MINIO_CONSOLE_PORT || 59361}  (MinIO)` +
      dim('\n  Ctrl+C — остановить. Упавший API или сайт перезапускается сам.\n'),
  );
  if (args.has('--open')) {
    if (win) spawn('cmd', ['/c', 'start', '', SITE], { detached: true, stdio: 'ignore' }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [SITE], { detached: true, stdio: 'ignore' }).unref();
  }
}

// Watchdog: the dev servers sometimes hang after hours (Next answers 500 to everything, the API loses the database
// after Docker restarts). Three failed checks in a row restart the process.
for (;;) {
  await sleep(30_000);
  if (stopping) break;
  for (const s of children.values()) {
    if (Date.now() - s.since < s.grace) continue;
    if (await httpOk(s.health, s.timeout ?? 10_000)) {
      s.misses = 0;
      continue;
    }
    s.misses++;
    if (s.misses < 3) continue;
    console.log(red(`[${s.name}] не отвечает полторы минуты — перезапускаю`));
    s.misses = 0;
    s.since = Date.now();
    const old = s.child;
    s.child = null;
    if (old?.pid) killTree(old.pid);
    for (const pid of pidsOnPort(s.name === 'api' ? API_PORT : WEB_PORT)) killTree(pid);
    await sleep(2000);
    s.child = startChild(s.name, s.script);
  }
}
