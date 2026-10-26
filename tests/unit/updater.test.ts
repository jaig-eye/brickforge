/** The version comparison behind the macOS update check (which reads GitHub's latest release). */
import { describe, expect, it } from 'vitest'
import { isNewer } from '../../electron/services/updater'

describe('isNewer', () => {
  it('compares each part as a number, not as text', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true)
    expect(isNewer('1.1.0', '1.0.1')).toBe(true)
    expect(isNewer('2.0.0', '1.99.99')).toBe(true)
    expect(isNewer('1.0.1', '1.0.0')).toBe(true)
  })

  it('is false for the same or an older version', () => {
    expect(isNewer('1.1.0', '1.1.0')).toBe(false)
    expect(isNewer('1.0.9', '1.1.0')).toBe(false)
  })

  it('reads a tag with a leading v and ignores anything after a dash', () => {
    expect(isNewer('v1.2.0', '1.1.0')).toBe(true)
    expect(isNewer('1.1.0-beta.2', '1.1.0')).toBe(false)
    expect(isNewer('1.2', '1.1.9')).toBe(true)
  })
})
