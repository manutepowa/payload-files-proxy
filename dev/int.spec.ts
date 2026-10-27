import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { payloadFilesProxy } from '../src/index.js'
import { createFileProxyHandler } from '../src/utils.js'
import { NextRESTClient } from './helpers/NextRESTClient.js'

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=',
  'base64',
)

let root: string
let payload: Payload
let client: NextRESTClient
let origin: Server
let requests: string[] = []
let handlerCalls = 0
let hookCalls = 0

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'payload-files-proxy-'))
  origin = createServer((request, response) => {
    requests.push(request.url || '')
    if (request.url?.includes('missing.png')) {
      response.writeHead(404)
      response.end('not found')
    } else if (request.url?.includes('redirect.png')) {
      response.writeHead(302, { location: '/target.png' })
      response.end()
    } else if (request.url?.includes('large.png')) {
      response.writeHead(200, { 'content-length': String(51 * 1024 * 1024) })
      response.end()
    } else {
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(image)
    }
  })
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve))
  const address = origin.address()
  if (!address || typeof address === 'string') throw new Error('Origin did not start')

  const config = buildConfig({
    secret: 'isolated-test-secret',
    db: sqliteAdapter({ client: { url: `file:${path.join(root, 'test.db')}` } }),
    editor: lexicalEditor(),
    collections: [
      { slug: 'media', fields: [], access: { read: () => true }, hooks: { afterRead: [({ doc }) => { hookCalls++; return doc }] }, upload: { staticDir: path.join(root, 'media'), handlers: [() => { handlerCalls++ }] } },
      { slug: 'private-media', fields: [], access: { read: () => false }, upload: { staticDir: path.join(root, 'private-media') } },
    ],
    plugins: [payloadFilesProxy({
      mediaCollectionSlug: 'media',
      mediaDirectory: root,
      originUrl: `http://127.0.0.1:${address.port}`,
    }), payloadFilesProxy({
      mediaCollectionSlug: 'private-media',
      mediaDirectory: root,
      originUrl: `http://127.0.0.1:${address.port}`,
    })],
  })
  payload = await getPayload({ config })
  client = new NextRESTClient(payload.config)
})

afterAll(async () => {
  if (payload) await payload.destroy()
  if (origin) await new Promise<void>((resolve, reject) => origin.close((error) => error ? reject(error) : resolve()))
  if (root) await rm(root, { recursive: true, force: true })
})

test('downloads a missing file only when its URL is requested and caches it locally', async () => {
  const doc = await payload.create({
    collection: 'media',
    data: {},
    file: { data: image, mimetype: 'image/png', name: 'example.png', size: image.length },
  })
  const localFile = path.join(root, 'media', doc.filename as string)
  await rm(localFile)
  requests = []

  hookCalls = 0
  handlerCalls = 0
  await payload.findByID({ collection: 'media', id: doc.id })
  expect(hookCalls).toBeGreaterThan(0)
  expect(handlerCalls).toBe(0)
  expect(requests).toHaveLength(0)

  const route = `/media/file/${encodeURIComponent(doc.filename as string)}` as const
  const first = await client.GET(route)
  expect(first.status).toBe(200)
  expect(handlerCalls).toBe(1)
  expect(Buffer.from(await first.arrayBuffer())).toEqual(image)
  expect(await readFile(localFile)).toEqual(image)
  expect(requests).toEqual([`/api/media/file/${encodeURIComponent(doc.filename as string)}`])

  const second = await client.GET(route)
  expect(second.status).toBe(200)
  expect(Buffer.from(await second.arrayBuffer())).toEqual(image)
  expect(requests).toHaveLength(1)
})

test('read access denial prevents origin requests', async () => {
  requests = []
  const response = await client.GET('/private-media/file/denied.png')
  expect(response.status).toBe(403)
  expect(requests).toEqual([])
  await expect(readFile(path.join(root, 'private-media', 'denied.png'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('a missing request URL is rejected without fetching', async () => {
  requests = []
  const handler = createFileProxyHandler('http://127.0.0.1:1')
  const req = { payload, url: undefined } as unknown as Parameters<typeof handler>[0]
  const response = await handler(req, { doc: { id: 'test' }, params: { collection: 'media', filename: 'no-url.png' } })
  expect(response?.status).toBe(400)
  expect(requests).toEqual([])
  await expect(readFile(path.join(root, 'media', 'no-url.png'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('network-path-looking pathname stays on the configured origin and preserves encoding', async () => {
  let untrustedRequests = 0
  const untrusted = createServer((_request, response) => {
    untrustedRequests++
    response.end('untrusted')
  })
  await new Promise<void>((resolve) => untrusted.listen(0, '127.0.0.1', resolve))
  try {
    const untrustedAddress = untrusted.address()
    const originAddress = origin.address()
    if (!untrustedAddress || typeof untrustedAddress === 'string' || !originAddress || typeof originAddress === 'string') throw new Error('Server did not start')
    const pathname = `//127.0.0.1:${untrustedAddress.port}/encoded%20name.png`
    const handler = createFileProxyHandler(`http://127.0.0.1:${originAddress.port}`)
    const req = { payload, url: `http://local.test${pathname}?ignored=1` } as unknown as Parameters<typeof handler>[0]
    requests = []
    const response = await handler(req, { doc: { id: 'test' }, params: { collection: 'media', filename: 'network-path.png' } })
    expect(untrustedRequests).toBe(0)
    expect(response).toBeUndefined()
    expect(requests).toEqual([pathname])
    expect(await readFile(path.join(root, 'media', 'network-path.png'))).toEqual(image)
  } finally {
    await new Promise<void>((resolve, reject) => untrusted.close((error) => error ? reject(error) : resolve()))
  }
})

test('concurrent requests share a download', async () => {
  requests = []
  const responses = await Promise.all(Array.from({ length: 5 }, () => client.GET('/media/file/concurrent.png')))
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
  for (const response of responses) expect(Buffer.from(await response.arrayBuffer())).toEqual(image)
  expect(requests).toEqual(['/api/media/file/concurrent.png'])
  expect(await readFile(path.join(root, 'media', 'concurrent.png'))).toEqual(image)
})

test.each(['missing.png', 'redirect.png', 'large.png'])('does not cache rejected origin response %s', async (filename) => {
  requests = []
  const response = await client.GET(`/media/file/${filename}`)
  expect(response.status).not.toBe(200)
  expect(requests).toEqual([`/api/media/file/${filename}`])
  await expect(readFile(path.join(root, 'media', filename))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await readdir(path.join(root, 'media'))).filter((name) => name.startsWith('.proxy-'))).toEqual([])
})
