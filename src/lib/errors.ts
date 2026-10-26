/**
 * Errors that cross the IPC boundary. Main-process handlers never throw raw
 * errors at the renderer; they return one of these, so the UI can react to the
 * kind of failure (a missing key opens Settings, a network error offers retry)
 * instead of string-matching messages.
 */
export type ServiceName =
  | 'rebrickable' | 'bricklink' | 'brickognize' | 'openai' | 'anthropic' | 'claude-code' | 'postgres'

export type AppErrorCode =
  | 'missing_key'    // the feature needs a key the user hasn't added
  | 'auth'           // the service rejected the key
  | 'rate_limited'
  | 'network'        // offline, DNS, timeout
  | 'service'        // the service answered with an error
  | 'not_found'
  | 'invalid_input'
  | 'internal'

export interface AppErrorShape {
  code: AppErrorCode
  message: string
  service?: ServiceName
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape }

export class AppError extends Error implements AppErrorShape {
  readonly code: AppErrorCode
  readonly service?: ServiceName

  constructor(shape: AppErrorShape) {
    super(shape.message)
    this.name = 'AppError'
    this.code = shape.code
    this.service = shape.service
  }

  toJSON(): AppErrorShape {
    return { code: this.code, message: this.message, service: this.service }
  }
}

export const SERVICE_LABEL: Record<ServiceName, string> = {
  rebrickable: 'Rebrickable',
  bricklink: 'BrickLink',
  brickognize: 'Brickognize',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'claude-code': 'Claude Code',
  postgres: 'your database',
}

export function missingKey(service: ServiceName, what = `a ${SERVICE_LABEL[service]} key`): AppError {
  return new AppError({ code: 'missing_key', service, message: `Add ${what} in Settings to use this.` })
}
