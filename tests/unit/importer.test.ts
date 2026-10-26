import { describe, it, expect } from 'vitest'
import { parseCsv, parseCollectionFile, toCsv, EXPORT_COLUMNS } from '../../electron/services/importer'

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('keeps commas and newlines inside quoted cells', () => {
    expect(parseCsv('name,qty\n"Falcon, UCS",1\n"two\nlines",2')).toEqual([['name', 'qty'], ['Falcon, UCS', '1'], ['two\nlines', '2']])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('note\n"He said ""mint"", honest"')).toEqual([['note'], ['He said "mint", honest']])
  })

  it('accepts CRLF, LF, and lone CR line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
    expect(parseCsv('a\rb')).toEqual([['a'], ['b']])
  })

  it('ignores a trailing newline and blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']])
  })

  it('keeps empty cells', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([['a', '', 'c'], ['', '', '']])
  })
})

describe('parseCollectionFile', () => {
  it('reads a Brickset export: owned quantities and wanted sets', () => {
    const csv = [
      'SetNumber,Name,Year,Theme,Pieces,Wanted,QtyOwned,PricePaid,Notes',
      '75192-1,Millennium Falcon,2017,Star Wars,7541,0,2,649.99,Shelf A',
      '21330-1,Home Alone,2021,Ideas,3955,1,0,,',
    ].join('\r\n')
    const { format, items, skipped } = parseCollectionFile(csv)
    expect(format).toBe('Brickset CSV')
    expect(skipped).toBe(0)
    expect(items).toEqual([
      { kind: 'set', number: '75192-1', quantity: 2, wanted: false, condition: undefined, price: 649.99, notes: 'Shelf A' },
      { kind: 'set', number: '21330-1', quantity: 1, wanted: true, condition: undefined, price: null, notes: null },
    ])
  })

  it('reads a Rebrickable set list export', () => {
    const { format, items } = parseCollectionFile('set_num,quantity,includes_spares\n10497-1,1,True\n75313-1,3,False\n')
    expect(format).toBe('Rebrickable CSV')
    expect(items.map((i) => [i.kind, i.number, i.quantity, i.wanted])).toEqual([['set', '10497-1', 1, false], ['set', '75313-1', 3, false]])
  })

  it('reads a Rebrickable export with spelled-out headers and a minifig list', () => {
    expect(parseCollectionFile('Set Number,Quantity\n10497-1,2').items).toMatchObject([{ kind: 'set', number: '10497-1', quantity: 2 }])
    const figs = parseCollectionFile('Fig Number,Quantity\nfig-002544,2\nfig-013153,1')
    expect(figs.items).toMatchObject([{ kind: 'minifig', number: 'fig-002544', quantity: 2 }, { kind: 'minifig', number: 'fig-013153', quantity: 1 }])
  })

  it('round-trips a BrickForge export, wishlist rows included', () => {
    const rows = [
      { type: 'set', number: '75192-1', name: 'Millennium Falcon', condition: 'sealed', quantity: 2, is_owned: 1, is_wanted: 0, acquired_price: 650, market_price: 701.94, notes: 'Shelf A, "top"',
        acquired_date: '2025-12-24', has_box: 1, has_instructions: 0, missing_parts: '2x 3023', tags: 'UCS; Display' },
      { type: 'set', number: '21330-1', name: 'Home Alone', condition: 'sealed', quantity: 1, is_owned: 0, is_wanted: 1, acquired_price: null, market_price: 266.88, notes: null },
      { type: 'set', number: '10497-1', name: 'Galaxy Explorer', condition: 'open_incomplete', quantity: 1, is_owned: 1, is_wanted: 0, acquired_price: null, market_price: 84.27, notes: null },
      { type: 'minifig', number: 'fig-002514', name: 'C-3PO', condition: 'new', quantity: 3, is_owned: 1, is_wanted: 0, acquired_price: 4.5, bricklink_id: 'sw0700', notes: 'line1\nline2' },
      { type: 'minifig', number: 'sw1034', name: 'BB-8', condition: 'used', quantity: 1, is_owned: 0, is_wanted: 1, acquired_price: null, notes: null },
    ]
    const { format, items, skipped } = parseCollectionFile(toCsv(rows, EXPORT_COLUMNS))
    expect(format).toBe('BrickForge CSV')
    expect(skipped).toBe(0)
    expect(items).toEqual([
      // the details only a BrickForge export carries come back too; a blank yes/no stays unstated
      { kind: 'set', number: '75192-1', quantity: 2, wanted: false, condition: 'sealed', price: 650, notes: 'Shelf A, "top"',
        acquired_date: '2025-12-24', has_box: true, has_instructions: false, missing_parts: '2x 3023', tags: ['UCS', 'Display'] },
      // is_owned=0, is_wanted=1 must come back as a wishlist item
      { kind: 'set', number: '21330-1', quantity: 1, wanted: true, condition: 'sealed', price: null, notes: null },
      // a market price is never mistaken for the price paid
      { kind: 'set', number: '10497-1', quantity: 1, wanted: false, condition: 'open_incomplete', price: null, notes: null },
      { kind: 'minifig', number: 'fig-002514', quantity: 3, wanted: false, condition: 'new', price: 4.5, notes: 'line1\nline2', bricklink_id: 'sw0700' },
      { kind: 'minifig', number: 'sw1034', quantity: 1, wanted: true, condition: 'used', price: null, notes: null },
    ])
  })

  it('reads a BrickLink wanted list (XML) as wishlist items, skipping parts', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<INVENTORY>
  <ITEM><ITEMTYPE>S</ITEMTYPE><ITEMID>75192-1</ITEMID><MINQTY>2</MINQTY><CONDITION>N</CONDITION></ITEM>
  <ITEM>
    <ITEMTYPE>M</ITEMTYPE>
    <ITEMID> sw0700 </ITEMID>
    <CONDITION>U</CONDITION>
  </ITEM>
  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR></ITEM>
  <ITEM><ITEMTYPE>S</ITEMTYPE><ITEMID>10497-1</ITEMID></ITEM>
</INVENTORY>`
    const { format, items, skipped } = parseCollectionFile(xml)
    expect(format).toBe('BrickLink wanted list (XML)')
    expect(skipped).toBe(1)
    expect(items).toEqual([
      { kind: 'set', number: '75192-1', quantity: 2, wanted: true, condition: 'new' },
      { kind: 'minifig', number: 'sw0700', quantity: 1, wanted: true, condition: 'used' },
      { kind: 'set', number: '10497-1', quantity: 1, wanted: true, condition: undefined },
    ])
  })

  it('reads a generic CSV with dollar prices and recognizes minifig ids by shape', () => {
    const csv = 'Set,Qty,Price Paid,Comments\n75192,1,"$1,099.99",Birthday\nsw0700,2,$3.50,\n10497,1,free,\n,1,$1,'
    const { format, items, skipped } = parseCollectionFile(csv)
    expect(format).toBe('CSV')
    expect(skipped).toBe(1)
    expect(items).toEqual([
      { kind: 'set', number: '75192', quantity: 1, wanted: false, condition: undefined, price: 1099.99, notes: 'Birthday' },
      { kind: 'minifig', number: 'sw0700', quantity: 2, wanted: false, condition: undefined, price: 3.5, notes: null },
      { kind: 'set', number: '10497', quantity: 1, wanted: false, condition: undefined, price: null, notes: null },
    ])
  })

  it('reads a file that starts with a byte-order mark', () => {
    expect(parseCollectionFile('﻿set_num,quantity\n10497-1,1').items).toHaveLength(1)
  })

  it('reports an unrecognized file instead of guessing', () => {
    expect(parseCollectionFile('Foo,Bar\n1,2\n3,4')).toEqual({ format: 'Unrecognized CSV (no set or minifig number column)', items: [], skipped: 2 })
    expect(parseCollectionFile('')).toEqual({ format: 'Empty file', items: [], skipped: 0 })
    expect(parseCollectionFile('<html><body>not a wanted list</body></html>').items).toEqual([])
  })
})
