// Local guard for the CI security hardening (Agent 2 / G6). Runs under `npm test`
// — so a careless edit that unpins an Action, drops the audit gate, or breaks a
// workflow's YAML fails locally and in CI, not silently in production.
//
// This mirrors vercel-config.test.ts: a root-level config-validation test that
// reads the files and asserts on them. It lives at the repo root (not in a tsconfig
// `include` dir) so it runs in vitest without being part of the app type program.
// `js-yaml` is already present (via eslint -> @eslint/eslintrc and shadcn ->
// cosmiconfig) and is used here purely to prove each file is valid YAML locally;
// the CI `actionlint` job is the authoritative GitHub-Actions schema check.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import jsyaml from 'js-yaml'

const WORKFLOWS = [
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/secret-scan.yml',
  '.github/workflows/deploy-pages.yml',
]
const ALL_YAML = [...WORKFLOWS, '.github/dependabot.yml']

const read = (p: string) => readFileSync(p, 'utf8')
const parse = (p: string) => jsyaml.load(read(p)) as Record<string, unknown>

describe('CI hardening: workflow files are valid YAML', () => {
  it('every workflow and dependabot file parses as YAML', () => {
    for (const f of ALL_YAML) {
      expect(() => jsyaml.load(read(f)), f).not.toThrow()
    }
  })

  it('uses spaces, never literal tabs (tabs are invalid YAML indentation)', () => {
    for (const f of ALL_YAML) {
      expect(read(f).includes('\t'), `${f} contains a literal tab`).toBe(false)
    }
  })
})

describe('CI hardening: supply-chain controls', () => {
  it('pins every third-party Action to a full 40-char commit SHA', () => {
    const usesRe = /uses:\s*([^\s#]+)/g
    for (const f of WORKFLOWS) {
      const src = read(f)
      let m: RegExpExecArray | null
      while ((m = usesRe.exec(src))) {
        const ref = m[1]
        // Local/composite (./…) and Docker (docker://) refs are exempt.
        if (ref.startsWith('./') || ref.startsWith('docker://')) continue
        const sha = ref.split('@')[1]
        expect(sha, `${f}: "${ref}" must be pinned to a 40-char commit SHA`).toMatch(
          /^[0-9a-f]{40}$/,
        )
      }
    }
  })

  it('declares an explicit permissions block in every workflow', () => {
    for (const f of WORKFLOWS) {
      expect(parse(f).permissions, `${f} must set top-level permissions`).toBeDefined()
    }
  })
})

describe('CI hardening: ci.yml gates', () => {
  const src = read('.github/workflows/ci.yml')
  const doc = parse('.github/workflows/ci.yml')

  it('runs a high-severity npm audit gate right after install', () => {
    expect(src).toContain('npm audit --audit-level=high')
  })

  it('keeps the original verify steps (typecheck, lint, test, build)', () => {
    for (const step of ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build']) {
      expect(src, `ci.yml lost "${step}"`).toContain(step)
    }
  })

  it('cancels superseded runs via a concurrency group', () => {
    expect(doc.concurrency).toBeDefined()
  })
})

describe('CI hardening: CodeQL', () => {
  const doc = parse('.github/workflows/codeql.yml')
  const src = read('.github/workflows/codeql.yml')

  it('analyzes javascript-typescript with the security-extended suite', () => {
    expect(src).toContain('javascript-typescript')
    expect(src).toContain('security-extended')
  })

  it('runs weekly on Sunday midnight (cron 0 0 * * 0)', () => {
    const on = doc.on as { schedule?: Array<{ cron: string }> }
    const crons = (on.schedule ?? []).map((s) => s.cron)
    expect(crons).toContain('0 0 * * 0')
  })
})

describe('CI hardening: secret scanning', () => {
  const doc = parse('.github/workflows/secret-scan.yml')
  const src = read('.github/workflows/secret-scan.yml')

  it('runs gitleaks on push and pull_request', () => {
    const on = doc.on as Record<string, unknown>
    expect('push' in on, 'secret-scan must trigger on push').toBe(true)
    expect('pull_request' in on, 'secret-scan must trigger on pull_request').toBe(true)
    expect(src).toContain('gitleaks/gitleaks-action')
  })
})

describe('CI hardening: Dependabot', () => {
  const doc = parse('.github/dependabot.yml')
  const updates = doc.updates as Array<Record<string, unknown>>

  it('watches both npm and github-actions', () => {
    const ecosystems = updates.map((u) => u['package-ecosystem'])
    expect(ecosystems).toContain('npm')
    expect(ecosystems).toContain('github-actions')
  })

  it('runs weekly, groups minor+patch, and assigns the owner as reviewer', () => {
    for (const u of updates) {
      expect((u.schedule as { interval: string }).interval).toBe('weekly')
      expect(u.reviewers, 'each ecosystem must list a reviewer').toContain('dimebagforafifth')
      expect(u.groups, 'each ecosystem must group minor+patch updates').toBeDefined()
    }
  })
})
