/**
 * LEGO identifier rules — the single home for fig/set ID semantics shared by
 * the main process and the renderer.
 *
 * Two minifig ID schemes coexist:
 *  - Rebrickable numbers: "fig-XXXXXX" — internal catalog ids, unknown to BrickLink
 *  - BrickLink IDs: "sw0380", "njo123a" — the ids the price guide understands
 */

/** True when the number is a Rebrickable-internal fig id (no BrickLink meaning). */
export function isRebrickableFigNumber(id: string): boolean {
  return id.startsWith('fig-')
}

/** Loose shape check for a BrickLink minifig ID (e.g. sw0380, njo123a, col456). */
export function looksLikeBricklinkFigId(id: string): boolean {
  return /^[a-z]{2,6}\d{2,5}[a-z]?$/i.test(id.trim())
}

/**
 * The id to use for BrickLink price lookups: the cached bricklink_id when set,
 * else the fig_number itself when it is not Rebrickable-internal. Null when no
 * BrickLink-priceable id exists.
 */
export function bricklinkLookupId(figNumber: string, bricklinkId?: string | null): string | null {
  const cached = bricklinkId?.trim()
  if (cached && !isRebrickableFigNumber(cached)) return cached
  if (!isRebrickableFigNumber(figNumber)) return figNumber
  return null
}

/** BrickLink catalog page URL for a set (S), minifig (M), or part (P). */
export function bricklinkCatalogUrl(type: 'S' | 'M' | 'P', id: string): string {
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?${type}=${encodeURIComponent(id)}`
}
