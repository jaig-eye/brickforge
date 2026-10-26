/**
 * Talking to the user's own Postgres: a pasted connection string becomes pg
 * settings (SSL chosen the way libpq would, from sslmode), and pg's failures
 * become messages a collector can act on. The connection string and the
 * password never appear in an error, a log line, or anything sent to the UI.
 */
import type { PoolConfig } from 'pg'
import { AppError, type AppErrorCode } from '../../src/lib/errors'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const fail = (code: AppErrorCode, message: string) => new AppError({ code, service: 'postgres', message })

const unreadable = () => fail('invalid_input',
  "That connection string couldn't be read. It should look like postgresql://user:password@host:5432/database "
  + '(symbols such as @ # / ? in the password need to be URL-encoded).')

function decode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/**
 * sslmode as libpq reads it, except that allow/prefer never fall back to an
 * unencrypted connection. No sslmode: encrypted and verified, except on this PC.
 */
function sslFor(host: string, mode: string): PoolConfig['ssl'] {
  switch (mode) {
    case 'disable':
      return false
    case 'allow':
    case 'prefer':
    case 'require':
    case 'no-verify':
      return { rejectUnauthorized: false }
    case 'verify-ca':
      return { rejectUnauthorized: true, checkServerIdentity: () => undefined }
    case 'verify-full':
      return { rejectUnauthorized: true }
    case '':
      return LOCAL_HOSTS.has(host.toLowerCase()) ? false : { rejectUnauthorized: true }
    default:
      throw fail('invalid_input', `BrickForge doesn't know sslmode "${mode.slice(0, 20)}". Use require, verify-full, or disable.`)
  }
}

/** pg settings for a connection string; throws a plain-language AppError when it can't be used. */
export function connectionConfig(url: string): PoolConfig {
  let u: URL
  try { u = new URL(url.trim()) } catch { throw unreadable() }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw unreadable()
  const host = decode(u.hostname).replace(/^\[(.*)\]$/, '$1')
  if (!host) throw fail('invalid_input', 'The connection string has no server name.')
  return {
    host,
    port: u.port ? Number(u.port) : 5432,
    user: decode(u.username) || undefined,
    password: decode(u.password) || undefined,
    database: decode(u.pathname.replace(/^\//, '')) || undefined,
    ssl: sslFor(host, (u.searchParams.get('sslmode') ?? '').toLowerCase()),
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    keepAlive: true,
    application_name: 'BrickForge',
  }
}

/** "Connected to PostgreSQL 16.4" from SELECT version(). */
export function describeServer(version: unknown): string {
  const m = typeof version === 'string' ? /PostgreSQL (\d+(?:\.\d+)?)/.exec(version) : null
  return m ? `Connected to PostgreSQL ${m[1]}` : 'Connected to the database'
}

/** The code on a pg or Node network error, for logs (never the message, which can name the host). */
export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'unknown'
}

/** Turn whatever pg threw into an AppError that tells the user what to fix. */
export function friendlyError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const code = errorCode(err)
  const raw = (err as { message?: unknown } | null)?.message
  const msg = typeof raw === 'string' ? raw : ''
  switch (code) {
    case '28P01':
      return fail('auth', 'The database rejected the password. Check the user name and password in the connection string.')
    case '28000':
      return /SSL off|no encryption/i.test(msg)
        ? fail('auth', 'The server only accepts secure connections. Take sslmode=disable out of the connection string.')
        : fail('auth', "The server doesn't let this user connect from here. Check the user name, and that the server accepts connections from your network.")
    case '3D000':
      return fail('not_found', "That database doesn't exist on the server. Check the database name at the end of the connection string.")
    case '42501':
      return fail('auth', "This database user isn't allowed to create or change BrickForge's sync table. Use the database owner's connection string, or grant CREATE on the schema.")
    case '53300':
      return fail('rate_limited', 'The database has too many open connections right now. Try again in a minute.')
    case '57P01':
    case '57P02':
    case '57P03':
      return fail('network', 'The database is restarting or not accepting connections yet. Try again in a minute.')
    case '57014':
      return fail('network', 'The database took too long to answer. Try again in a minute.')
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return fail('network', "Couldn't find that database server. Check the server name in the connection string, and that you're online.")
    case 'ECONNREFUSED':
      return fail('network', 'The server refused the connection. Check the port number, and that the database is running.')
    case 'ETIMEDOUT':
    case 'ECONNRESET':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return fail('network', "Couldn't reach the database server. Check that you're online.")
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
      return fail('network', "BrickForge couldn't verify the server's security certificate. If you trust this server, "
        + 'add ?sslmode=require to the end of the connection string to connect encrypted without that check.')
    case 'CERT_HAS_EXPIRED':
      return fail('network', "The server's security certificate has expired.")
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return fail('network', "The server's security certificate is for a different server name. Check the server name in the connection string.")
  }
  if (/does not support SSL/i.test(msg)) {
    return fail('network', "This server doesn't accept secure connections. If it runs on your own PC or network, add ?sslmode=disable to the connection string.")
  }
  if (/timeout|timed out/i.test(msg)) {
    return fail('network', "The database didn't answer in time. Check the server name and port, and that you're online.")
  }
  if (/terminated|connection.*closed|Connection ended/i.test(msg)) {
    return fail('network', 'The connection to the database dropped. Try again in a minute.')
  }
  if (/client password must be a string|SASL/i.test(msg)) {
    return fail('auth', 'The connection string has no password. Put it after the user name: postgresql://user:password@host/database')
  }
  // Other server errors (5-character SQLSTATE) come from Postgres itself and never include the password
  if (/^[0-9A-Z]{5}$/.test(code) && msg) return fail('service', `The database reported an error: ${msg.slice(0, 200)}`)
  return fail('service', 'Something went wrong talking to the database.')
}
