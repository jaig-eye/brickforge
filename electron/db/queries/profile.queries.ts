import { getDb } from '../index'

export interface Profile {
  id: number
  display_name: string
  avatar_id: string
  theme_name: string
  color_accent: string
  created_at: string
  updated_at: string
}

export function getProfile(): Profile {
  return getDb().prepare('SELECT * FROM profiles WHERE id = 1').get() as Profile
}

export function updateProfile(patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>): Profile {
  const db = getDb()
  const fields = Object.keys(patch).map((k) => `${k} = ?`).join(', ')
  const values = Object.values(patch)
  db.prepare(`UPDATE profiles SET ${fields}, updated_at = datetime('now') WHERE id = 1`).run(...values)
  return getProfile()
}
