import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Reads `.env.local` — the E2E run talks to the same project as the app. */
export function localEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.env.local')
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  )
}

export const DEMO_PASSWORD = localEnv().DEMO_PASSWORD || 'LetItCast2026!'
