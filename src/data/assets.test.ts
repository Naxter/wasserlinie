import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOutline, MissingDataError } from './assets'

function reply(body: string, init: ResponseInit): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, init)))
}

afterEach(() => vi.unstubAllGlobals())

describe('missing data', () => {
  it('is reported by name when the server admits it is missing', async () => {
    reply('not found', { status: 404 })
    await expect(loadOutline()).rejects.toBeInstanceOf(MissingDataError)
  })

  it('is reported by name when a dev server answers with the app shell', async () => {
    // Vite serves index.html with a 200 for any path it does not have, so a
    // missing data file arrives as HTML. Before this was handled, the first
    // run of a fresh clone failed with "Unexpected token '<'" from the JSON
    // parser and never said which file was missing.
    reply('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    await expect(loadOutline()).rejects.toBeInstanceOf(MissingDataError)
  })

  it('names the file and the command that makes it', async () => {
    reply('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    await expect(loadOutline()).rejects.toThrow(/germany\.json/)
    reply('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    await expect(loadOutline()).rejects.toThrow(/wasserlinie demo/)
  })

  it('passes real json through', async () => {
    reply('{"rings":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    await expect(loadOutline()).resolves.toEqual({ rings: [] })
  })
})
