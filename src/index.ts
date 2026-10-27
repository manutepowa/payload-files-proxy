import type { Config, Plugin } from 'payload'

import { createFileProxyHandler } from './utils.js'

export type PayloadFilesProxyConfig = {
  disabled?: boolean
  /** Slug of the upload collection. */
  mediaCollectionSlug?: string
  /** Retained for compatibility; Payload's configured staticDir determines the destination. */
  mediaDirectory: string
  originUrl: string
}

export const payloadFilesProxy =
  (options: PayloadFilesProxyConfig): Plugin =>
  (config: Config): Config => {
    if (options.disabled || !options.mediaCollectionSlug) return config

    return {
      ...config,
      collections: config.collections?.map((collection) => {
        if (collection.slug !== options.mediaCollectionSlug || !collection.upload) return collection
        const upload = collection.upload === true ? {} : collection.upload
        return {
          ...collection,
          upload: {
            ...upload,
            handlers: [...(upload.handlers || []), createFileProxyHandler(options.originUrl)],
          },
        }
      }),
    }
  }
