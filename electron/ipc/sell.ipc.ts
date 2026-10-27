import { IPC } from '../../src/lib/ipc-types'
import type { ListingPrefs } from '../../src/lib/types'
import { listListings, deleteListing } from '../db/queries/listing.queries'
import { generateListing, listingInputFor, priceSuggestion } from '../services/listing'
import { identifySetPhoto } from '../services/identify'
import { handle, str, int, cond, obj, optStr, photo } from './handle'

function prefs(v: unknown): ListingPrefs {
  const p = obj<ListingPrefs>(v)
  return {
    completeness: p.completeness === 'partial' || p.completeness === 'incomplete' ? p.completeness : 'complete',
    includes_instructions: p.includes_instructions !== false,
    includes_figures: p.includes_figures !== false,
    includes_box: p.includes_box === true,
    smoke_free_home: p.smoke_free_home === true,
    clean_set: p.clean_set === true,
    seller_notes: optStr(p.seller_notes, 600)?.trim() || null,
  }
}

export function registerSellHandlers(): void {
  handle(IPC.SELL_IDENTIFY, (b64: unknown, hint?: unknown) => identifySetPhoto(photo(b64), { contextHint: optStr(hint, 300)?.trim() || '' }))
  handle(IPC.SELL_GENERATE, async (setNumber: unknown, p: unknown) => generateListing(await listingInputFor(str(setNumber, 30)), prefs(p)))
  handle(IPC.SELL_PRICE, (number: unknown, c: unknown, kind?: unknown) => priceSuggestion(str(number, 30), cond(c), kind === 'minifig' ? 'MINIFIG' : 'SET'))
  handle(IPC.SELL_HISTORY, () => listListings())
  handle(IPC.SELL_DELETE, (id: unknown) => deleteListing(int(id)))
}
