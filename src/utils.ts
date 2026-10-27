import type { CollectionConfig } from 'payload'

import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

type UploadOptions = Exclude<NonNullable<CollectionConfig['upload']>, boolean>
type FileHandler = NonNullable<UploadOptions['handlers']>[number]
const maxBytes = 50 * 1024 * 1024
const pending = new Map<string, Promise<void>>()

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || response.status !== 200 || !response.body) throw new Error('Origin request failed')
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Origin file too large')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('Origin file too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  if (length && size !== Number(length)) throw new Error('Incomplete origin file')
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.proxy-${randomUUID()}`)
  try {
    await writeFile(temporary, Buffer.concat(chunks), { flag: 'wx' })
    try {
      await link(temporary, file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

export const createFileProxyHandler = (originUrl: string): FileHandler => (req, { params }) => {
  // Payload's handler type spells the async return as a union of promises.
  return handleRequest(req, params, originUrl) as Promise<Response> | Promise<void>
}

async function handleRequest(
  req: Parameters<FileHandler>[0],
  params: Parameters<FileHandler>[1]['params'],
  originUrl: string,
): Promise<Response | void> {
  const { collection, filename } = params
  // Payload will otherwise resolve filenames itself; reject unsafe names before it can do so.
  if (!filename || filename === '.' || filename === '..' || /[/\\\0]/.test(filename)) {
    return new Response('Invalid filename', { status: 400 })
  }
  const upload = Object.values(req.payload.collections).find(({ config }) => config.slug === collection)?.config.upload
  if (!upload || upload.disableLocalStorage) return
  const file = path.resolve(upload.staticDir || collection, filename)
  try {
    if (await exists(file)) return
    if (!req.url) return new Response('Invalid request URL', { status: 400 })
    const pathname = new URL(req.url).pathname
    const origin = new URL(originUrl)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid origin')
    // Assign a pathname rather than resolving a relative URL: // must not replace the host.
    origin.pathname = pathname
    origin.search = ''
    origin.hash = ''
    const url = origin.toString()
    let operation = pending.get(file)
    if (!operation) {
      operation = download(url, file)
      pending.set(file, operation)
      operation.finally(() => pending.delete(file)).catch(() => {})
    }
    await operation
  } catch (error) {
    req.payload.logger.error({ err: error, msg: 'File proxy download failed' })
    return new Response('File proxy download failed', { status: 502 })
  }
}
