import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SCRIPT = join(ROOT, 'scripts', 'guard.js')

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
}

function makeRepo({ git = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'just-wishing-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }), 'utf8')
  writeFileSync(join(dir, 'project.md'), '# Fixture\n', 'utf8')
  if (git) {
    runGit(dir, ['init', '-q'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    runGit(dir, ['add', '.'])
    runGit(dir, ['commit', '-qm', 'init'])
  }
  return dir
}

function runGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('preflight: writes a passing marker and reports the project', () => {
  const dir = makeRepo()
  const result = run(['preflight', '--dir', dir, '--use', 'self'], dir)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /preflight: PASS/)
  const marker = JSON.parse(readFileSync(join(dir, '.just-wishing', 'preflight.json'), 'utf8'))
  assert.equal(marker.ok, true)
  assert.equal(marker.use, 'self')
})

test('preflight: missing --use exits 2', () => {
  const dir = makeRepo()
  const result = run(['preflight', '--dir', dir], dir)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /--use/)
})

test('backup: creates a git tag in a repo', () => {
  const dir = makeRepo()
  const result = run(['backup', '--dir', dir, '--label', 'login-ui'], dir)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /backup: git tag pre-login-ui-/)
  assert.match(runGit(dir, ['tag', '--list']), /pre-login-ui-/)
})

test('backup: creates a sibling directory outside git', () => {
  const dir = makeRepo({ git: false })
  const result = run(['backup', '--dir', dir, '--label', 'login-ui'], dir)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /backup: .*\.bak-/)
  const backupPath = result.stdout.match(/backup: (.+)/)?.[1].trim()
  assert.ok(backupPath && existsSync(backupPath), 'backup directory should exist')
  assert.equal(existsSync(join(dir, 'package.json')), true)
})

test('commit-check: fails without preflight, passes after it', () => {
  const dir = makeRepo()
  const before = run(['commit-check', '--dir', dir], dir)
  assert.equal(before.status, 1)
  assert.match(before.stderr, /preflight/)
  assert.equal(run(['preflight', '--dir', dir, '--use', 'self'], dir).status, 0)
  const after = run(['commit-check', '--dir', dir], dir)
  assert.equal(after.status, 0, after.stderr)
  assert.match(after.stdout, /commit-check: PASS/)
})

test('install-hook: writes an executable pre-commit hook', () => {
  const dir = makeRepo()
  assert.equal(run(['preflight', '--dir', dir, '--use', 'self'], dir).status, 0)
  const result = run(['install-hook', '--dir', dir], dir)
  assert.equal(result.status, 0, result.stderr)
  const hook = join(dir, '.git', 'hooks', 'pre-commit')
  assert.equal(existsSync(hook), true)
  assert.match(readFileSync(hook, 'utf8'), /commit-check/)
})
