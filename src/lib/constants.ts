export const THEMES = [
  { id: 'dark-midnight', name: 'Dark Midnight', accent: '#FFD700', preview: '#0F0F10' },
  { id: 'classic-red',   name: 'Classic Red',   accent: '#CC0000', preview: '#110808' },
  { id: 'ocean-blue',    name: 'Ocean Blue',    accent: '#006DB7', preview: '#080F18' },
  { id: 'forest-green',  name: 'Forest Green',  accent: '#237F52', preview: '#081208' },
  { id: 'light-studio',  name: 'Light Studio',  accent: '#FFD700', preview: '#F0F0F5' },
] as const

export type ThemeId = typeof THEMES[number]['id']

export const AVATARS = [
  'default-01', 'default-02', 'default-03', 'default-04',
  'default-05', 'default-06', 'default-07', 'default-08',
] as const

export const LEGO_THEMES = [
  'City', 'Technic', 'Star Wars', 'Harry Potter', 'Marvel',
  'DC', 'Ninjago', 'Creator', 'Architecture', 'Icons',
  'Jurassic World', 'Friends', 'Minecraft', 'Ideas',
] as const

export const SIDECAR_PORT = 8741
