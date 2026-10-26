/**
 * Claude Code provider — runs prompts through the locally installed Claude
 * Code CLI in headless mode (`claude -p`), which authenticates with the user's
 * existing Claude subscription sign-in. No API key involved.
 *
 * Vision works by writing images to a temp dir and instructing the CLI to Read
 * them (reads inside its working directory need no permission prompts).
 *
 * Personal-use path: each machine needs its own Claude Code install + login.
 */
import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import log from '../main/logger'
import { AppError } from '../../src/lib/errors'

/** The CLI to run; tests point this at a stand-in script. */
const CLAUDE_BIN = process.env.BRICKFORGE_CLAUDE_BIN || 'claude'

let availableCache: boolean | null = null

/**
 * Is the `claude` CLI on PATH and responsive? Only SUCCESS is cached — a
 * failed probe (cold start, AV scan, CLI installed mid-session) re-probes on
 * the next call instead of wedging the provider as unavailable all session.
 */
export function isClaudeCodeAvailable(): Promise<boolean> {
  if (availableCache === true) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      if (ok) availableCache = true
      resolve(ok)
    }
    try {
      const child = spawn(CLAUDE_BIN, ['--version'], { shell: true, windowsHide: true })
      let sawOutput = false
      child.stdout?.on('data', () => { sawOutput = true })
      child.on('error', () => done(false))
      child.on('close', (code) => done(sawOutput && code === 0))
      // Generous: a first-ever run of the npm shim can be slow under AV scanning
      setTimeout(() => { try { child.kill() } catch { /* already gone */ } done(false) }, 20_000)
    } catch {
      done(false)
    }
  })
}

/**
 * One headless prompt through the local Claude Code login. Images are written
 * to a per-call temp dir (cleaned up afterward) and referenced for the CLI to
 * Read before answering. Returns the model's final text.
 */
export async function callClaudeCode(
  prompt: string,
  images: { b64: string; mediaType: string }[] = [],
  timeoutMs = 240_000,
): Promise<string> {
  if (!(await isClaudeCodeAvailable())) {
    throw new AppError({ code: 'missing_key', service: 'claude-code', message: "Claude Code isn't installed or signed in on this PC. Install it and sign in, or pick another AI provider in Settings." })
  }
  const dir = path.join(app.getPath('userData'), 'scans', 'cc-tmp', crypto.randomBytes(6).toString('hex'))
  fs.mkdirSync(dir, { recursive: true })
  try {
    const files: string[] = []
    images.forEach((img, i) => {
      const ext = img.mediaType === 'image/png' ? 'png' : img.mediaType === 'image/webp' ? 'webp' : img.mediaType === 'image/gif' ? 'gif' : 'jpg'
      const f = path.join(dir, `image_${i + 1}.${ext}`)
      fs.writeFileSync(f, Buffer.from(img.b64, 'base64'))
      files.push(f)
    })
    const header = files.length
      ? `Before answering, use the Read tool to view ${files.length === 1 ? 'this image file' : `these ${files.length} image files, in order`}:\n${files.map((f, i) => `IMAGE ${i + 1}: ${f}`).join('\n')}\n\n`
      : ''
    const fullPrompt = `${header}${prompt}\n\nRespond with ONLY the requested output — no preamble, no narration of tool use.`

    return await new Promise<string>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => { if (!settled) { settled = true; fn() } }
      const child = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json', '--allowedTools', 'Read'], {
        shell: true, windowsHide: true, cwd: dir,
      })
      let out = ''
      let errOut = ''
      const timer = setTimeout(() => {
        try { child.kill() } catch { /* already gone */ }
        finish(() => reject(new AppError({ code: 'network', service: 'claude-code', message: 'Claude Code took too long to answer.' })))
      }, timeoutMs)
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (errOut += c))
      child.on('error', (e) => { clearTimeout(timer); finish(() => reject(e)) })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(() => {
          if (code !== 0) {
            return reject(new AppError({ code: 'service', service: 'claude-code', message: `Claude Code stopped with an error: ${(errOut || out).slice(0, 300)}` }))
          }
          try {
            const parsed = JSON.parse(out) as { is_error?: boolean; result?: unknown }
            if (parsed.is_error) return reject(new AppError({ code: 'service', service: 'claude-code', message: String(parsed.result ?? 'Claude Code returned an error') }))
            resolve(String(parsed.result ?? ''))
          } catch {
            resolve(out.trim()) // older CLI or plain-text fallback
          }
        })
      })
      child.stdin.write(fullPrompt)
      child.stdin.end()
    })
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { log.warn('[claude-code] temp cleanup failed for', dir) }
  }
}
