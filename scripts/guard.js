#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const USES = new Set(['self', 'free-closed', 'open-source', 'commercial'])

function usage() {
  return `用法:
  node scripts/guard.js preflight --dir <repo> --use <self|free-closed|open-source|commercial>
  node scripts/guard.js backup --dir <repo> --label <change>
  node scripts/guard.js commit-check --dir <repo>
  node scripts/guard.js install-hook --dir <repo> [--force]`
}

function parse(argv) {
  const [command, ...rest] = argv
  const options = { command, dir: process.cwd(), use: null, label: null, force: false, help: command === '--help' || command === '-h' }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--force') options.force = true
    else if (arg === '--dir' || arg === '--use' || arg === '--label') {
      const value = rest[++i]
      if (!value || value.startsWith('--')) throw new Error(`缺少值: ${arg}`)
      options[arg.slice(2)] = value
    } else throw new Error(`未知参数: ${arg}`)
  }
  return options
}

function git(dir, args, options = {}) {
  return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', ...options })
}

function isGit(dir) {
  return existsSync(join(dir, '.git'))
}

function timestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function safeLabel(value) {
  const label = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!label) throw new Error('--label 必须包含字母或数字')
  return label.slice(0, 48)
}

function preflight(options) {
  const dir = resolve(options.dir)
  if (!options.use) return fail(2, '必须提供 --use')
  if (!USES.has(options.use)) return fail(2, `--use 必须是: ${[...USES].join(' / ')}`)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(2, `目录不存在: ${dir}`)

  const major = Number(process.versions.node.split('.')[0])
  const problems = []
  const warnings = []
  if (major < 18) problems.push(`Node.js ${process.versions.node} < 18`)

  let packageInfo = null
  const packagePath = join(dir, 'package.json')
  if (existsSync(packagePath)) {
    try {
      packageInfo = JSON.parse(readFileSync(packagePath, 'utf8'))
    } catch {
      problems.push('package.json 不是有效 JSON')
    }
  } else {
    warnings.push('没有 package.json；请确认项目使用的测试命令')
  }

  const gitCheck = git(dir, ['--version'])
  if (gitCheck.status !== 0) warnings.push('未找到 git；备份将使用目录副本')

  const markerDir = join(dir, '.just-wishing')
  mkdirSync(markerDir, { recursive: true })
  writeFileSync(join(markerDir, 'preflight.json'), JSON.stringify({
    version: 1,
    ok: problems.length === 0,
    at: new Date().toISOString(),
    dir,
    use: options.use,
    node: process.versions.node,
  }, null, 2) + '\n', 'utf8')

  console.log(`preflight: ${problems.length ? 'FAIL' : 'PASS'}`)
  console.log(`dir: ${dir}`)
  console.log(`node: ${process.versions.node}`)
  console.log(`git: ${gitCheck.status === 0 ? 'available' : 'missing'}`)
  console.log(`use: ${options.use}`)
  if (packageInfo?.scripts?.test) console.log(`test: ${packageInfo.scripts.test}`)
  for (const warning of warnings) console.log(`WARN: ${warning}`)
  for (const problem of problems) console.log(`FAIL: ${problem}`)
  return problems.length ? 1 : 0
}

function backup(options) {
  const dir = resolve(options.dir)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(2, `目录不存在: ${dir}`)
  let label
  try { label = safeLabel(options.label) } catch (error) { return fail(2, error.message) }
  const stamp = timestamp()

  if (isGit(dir)) {
    let tag = `pre-${label}-${stamp}`
    for (let n = 2; git(dir, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]).status === 0; n++) {
      tag = `pre-${label}-${stamp}-${n}`
    }
    const result = git(dir, ['tag', tag])
    if (result.status !== 0) return fail(1, `创建 git tag 失败: ${result.stderr.trim()}`)
    console.log(`backup: git tag ${tag}`)
    return 0
  }

  const base = join(dirname(dir), `${basename(dir)}.bak-${stamp}`)
  let destination = base
  for (let n = 2; existsSync(destination); n++) destination = `${base}-${n}`
  try {
    cpSync(dir, destination, {
      recursive: true,
      filter: source => {
        const rel = relative(dir, source)
        const top = rel.split(/[\\/]/)[0]
        return !['.git', 'node_modules', '.just-wishing'].includes(top)
      },
    })
  } catch (error) {
    return fail(1, `目录备份失败: ${error.message}`)
  }
  console.log(`backup: ${destination}`)
  return 0
}

function commitCheck(options) {
  const dir = resolve(options.dir)
  if (!isGit(dir)) return fail(2, `不是 git 仓库: ${dir}`)
  const marker = join(dir, '.just-wishing', 'preflight.json')
  if (!existsSync(marker)) return fail(1, '没有 preflight 记录；先运行 guard.js preflight')
  try {
    const state = JSON.parse(readFileSync(marker, 'utf8'))
    if (!state.ok) return fail(1, 'preflight 没有通过；先修复再提交')
    if (state.dir && resolve(state.dir) !== dir) return fail(1, 'preflight 记录属于另一个目录')
  } catch {
    return fail(1, 'preflight 记录无法读取')
  }
  for (const args of [['diff', '--check'], ['diff', '--cached', '--check']]) {
    const result = git(dir, args)
    if (result.status !== 0) return fail(1, `git ${args.join(' ')} 失败:\n${result.stdout}${result.stderr}`)
  }
  console.log('commit-check: PASS')
  return 0
}

function installHook(options) {
  const dir = resolve(options.dir)
  if (!isGit(dir)) return fail(2, `不是 git 仓库: ${dir}`)
  const hookDir = join(dir, '.git', 'hooks')
  const hook = join(hookDir, 'pre-commit')
  if (existsSync(hook) && !options.force) return fail(1, `pre-commit 已存在；加 --force 覆盖`)
  mkdirSync(hookDir, { recursive: true })
  const script = `#!/bin/sh\nexec node "${join(ROOT, 'scripts', 'guard.js').replaceAll('\\', '/')}" commit-check --dir "${dir.replaceAll('\\', '/')}"\n`
  writeFileSync(hook, script, { mode: 0o755 })
  console.log(`hook: ${hook}`)
  return 0
}

function fail(code, message) {
  console.error(message)
  return code
}

export function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parse(argv)
  } catch (error) {
    console.error(error.message)
    console.error(usage())
    return 2
  }
  if (options.help) { console.log(usage()); return 0 }
  switch (options.command) {
    case 'preflight': return preflight(options)
    case 'backup': return backup(options)
    case 'commit-check': return commitCheck(options)
    case 'install-hook': return installHook(options)
    default: console.error(usage()); return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
