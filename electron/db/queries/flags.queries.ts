import { getDb } from '../index'

export interface FeatureFlag {
  key: string
  enabled: 0 | 1
  tier: 'free' | 'alpha' | 'premium'
  description: string | null
  updated_at: string
}

export function getAllFlags(): FeatureFlag[] {
  return getDb().prepare('SELECT * FROM feature_flags ORDER BY key').all() as FeatureFlag[]
}

export function setFlag(key: string, enabled: 0 | 1): void {
  getDb().prepare(
    "UPDATE feature_flags SET enabled = ?, updated_at = datetime('now') WHERE key = ?"
  ).run(enabled, key)
}

export function getFlag(key: string): boolean {
  const row = getDb().prepare('SELECT enabled FROM feature_flags WHERE key = ?').get(key) as { enabled: 0 | 1 } | undefined
  return row?.enabled === 1
}
