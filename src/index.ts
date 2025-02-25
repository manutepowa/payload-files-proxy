import type { Config } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { checkIfFileExists } from './utils.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)


export type PayloadFilesProxyConfig = {
  disabled?: boolean
  /**
   * Slug of media collection
   */
  mediaCollectionSlug?: string
  mediaDirectory: string
  originUrl: string
}

export const payloadFilesProxy =
  (pluginOptions: PayloadFilesProxyConfig) =>
  (config: Config): Config => {
    /**
     * If the plugin is disabled, we still want to keep added collections/fields so the database schema is consistent which is important for migrations.
     * If your plugin heavily modifies the database schema, you may want to remove this property.
     */
    if (pluginOptions.disabled) {
      return config
    }

    if (!config.collections) {
      config.collections = []
    }

    const mediaCollection = config.collections.find(
      (collection) => collection.slug === pluginOptions.mediaCollectionSlug,
    )

    if (!mediaCollection) {
      return config
    }


    // @TODO: This path is not correct.
    // @ts-expect-error Because staticDir is boolean | OtherType
    const uploadDir = mediaCollection.upload?.staticDir || pluginOptions.mediaDirectory + '/' + pluginOptions.mediaCollectionSlug

    // Add hook to read collection
    mediaCollection.hooks = {
      afterRead: [
        ...(mediaCollection?.hooks?.afterRead || []),
        checkIfFileExists(uploadDir, pluginOptions.originUrl),
      ]
    }


    return config
  }
