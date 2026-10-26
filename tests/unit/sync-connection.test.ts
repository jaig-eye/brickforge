/**
 * Connection strings people paste from Supabase, Neon, or their own server,
 * and the failures they hit, in plain language and without echoing secrets.
 */
import { describe, it, expect } from 'vitest'
import { connectionConfig, describeServer, friendlyError } from '../../electron/services/sync-connection'
import { AppError } from '../../src/lib/errors'

const SECRET = 'p@ss/w0rd?'
const SUPABASE = `postgresql://postgres.abcd:${encodeURIComponent(SECRET)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`

describe('connectionConfig', () => {
  it('reads every part of the URL, decoding the password', () => {
    expect(connectionConfig(SUPABASE)).toMatchObject({
      host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, user: 'postgres.abcd', password: SECRET,
      database: 'postgres', connectionTimeoutMillis: 10_000,
    })
  })

  it('encrypts and verifies by default, except on this PC', () => {
    expect(connectionConfig(SUPABASE).ssl).toEqual({ rejectUnauthorized: true })
    expect(connectionConfig('postgres://me:pw@localhost/bricks').ssl).toBe(false)
    expect(connectionConfig('postgres://me:pw@[::1]:5433/bricks')).toMatchObject({ host: '::1', port: 5433, ssl: false })
  })

  it('honours sslmode', () => {
    const ssl = (mode: string) => connectionConfig(`postgresql://u:p@db.example.com/db?sslmode=${mode}`).ssl
    expect(ssl('disable')).toBe(false)
    expect(ssl('require')).toEqual({ rejectUnauthorized: false })
    expect(ssl('prefer')).toEqual({ rejectUnauthorized: false })
    expect(ssl('verify-full')).toEqual({ rejectUnauthorized: true })
    expect(ssl('verify-ca')).toMatchObject({ rejectUnauthorized: true })
    expect(() => ssl('sometimes')).toThrow(/sslmode/)
  })

  it('refuses anything that is not a Postgres URL, without repeating it', () => {
    for (const bad of ['mysql://u:hunter2@db/x', 'hunter2', 'postgresql://', '']) {
      const err = (() => { try { connectionConfig(bad); return null } catch (e) { return e } })()
      expect(err).toBeInstanceOf(AppError)
      expect(err).toMatchObject({ code: 'invalid_input', service: 'postgres' })
      expect((err as Error).message).not.toContain('hunter2')
    }
  })
})

describe('friendlyError', () => {
  const cases: [Record<string, string>, string, RegExp][] = [
    [{ code: '28P01', message: 'password authentication failed for user "postgres"' }, 'auth', /password/],
    [{ code: '3D000', message: 'database "brick" does not exist' }, 'not_found', /database doesn't exist/],
    [{ code: '42501', message: 'permission denied for schema public' }, 'auth', /create/],
    [{ code: '28000', message: 'no pg_hba.conf entry for host "1.2.3.4", user "u", database "d", SSL off' }, 'auth', /secure connections/],
    [{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND db.nowhere.example' }, 'network', /Couldn't find/],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' }, 'network', /refused/],
    [{ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'self-signed certificate in certificate chain' }, 'network', /sslmode=require/],
    [{ message: 'The server does not support SSL connections' }, 'network', /sslmode=disable/],
    [{ message: 'Connection terminated due to connection timeout' }, 'network', /didn't answer/],
    [{ message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string' }, 'auth', /no password/],
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'service', /duplicate key/],
  ]

  it.each(cases)('explains %o', (raw, code, message) => {
    const err = friendlyError(Object.assign(new Error(raw.message), raw.code ? { code: raw.code } : {}))
    expect(err).toMatchObject({ code, service: 'postgres' })
    expect(err.message).toMatch(message)
  })

  it('never passes on the text of an unrecognised error', () => {
    const err = friendlyError(new Error(`could not connect to ${SUPABASE}`))
    expect(err.message).not.toContain(encodeURIComponent(SECRET))
    expect(err.message).not.toContain('supabase')
  })
})

describe('describeServer', () => {
  it('names the Postgres version', () => {
    expect(describeServer('PostgreSQL 16.4 on x86_64-pc-linux-gnu, compiled by gcc')).toBe('Connected to PostgreSQL 16.4')
    expect(describeServer(undefined)).toBe('Connected to the database')
  })
})
