/**
 * Condition semantics — the single home for set/fig condition normalization,
 * shared by main and renderer. Previously four layers (SQL CASE expressions,
 * IPC normalizers, renderer ternaries, migrations) each had their own copy and
 * they disagreed on legacy values.
 */

export type SetCondition = 'sealed' | 'open_complete' | 'open_incomplete'
export type FigCondition = 'new' | 'used' | 'cracked'

/** Canonicalize any historical/imported set condition to the 3-value model. */
export function normalizeSetCondition(c: string | null | undefined): SetCondition {
  switch ((c ?? '').toLowerCase().trim()) {
    case 'sealed':
    case 'new':            // legacy + Brickset CSV vocabulary
      return 'sealed'
    case 'open_incomplete':
    case 'incomplete':
      return 'open_incomplete'
    case 'open_complete':
    case 'used':           // legacy vocabulary
    default:
      return 'open_complete'
  }
}

export function normalizeFigCondition(c: string | null | undefined): FigCondition {
  switch ((c ?? '').toLowerCase().trim()) {
    case 'new':     return 'new'
    case 'cracked': return 'cracked'
    default:        return 'used'
  }
}

/** Which BrickLink price-guide condition values a set at: sealed → new, else used. */
export function priceConditionForSet(c: string | null | undefined): 'new' | 'used' {
  return normalizeSetCondition(c) === 'sealed' ? 'new' : 'used'
}

/** Which price-guide condition values a fig at (cracked has no BL equivalent → used). */
export function priceConditionForFig(c: string | null | undefined): 'new' | 'used' {
  return c === 'new' ? 'new' : 'used'
}

export const SET_CONDITION_LABEL: Record<SetCondition, string> = {
  sealed: 'Sealed',
  open_complete: 'Opened, complete',
  open_incomplete: 'Opened, incomplete',
}

export const FIG_CONDITION_LABEL: Record<FigCondition, string> = {
  new: 'New',
  used: 'Used',
  cracked: 'Damaged',
}
