import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('published package entry points', () => {
  it('points all entry points at files included in the package', () => {
    expect(manifest.main).toBe('./dist/index.js')
    expect(manifest.types).toBe('./dist/index.d.ts')
    expect(manifest.exports['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts',
      default: './dist/index.js',
    })
  })
})
