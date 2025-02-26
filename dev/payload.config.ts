import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { payloadFilesProxy } from 'payload-files-proxy'
import { seed } from 'seed.js'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { devUser } from './helpers/credentials.js'
import { testEmailAdapter } from './helpers/testEmailAdapter.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)


if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export default buildConfig({
  admin: {
    autoLogin: devUser,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'posts',
      fields: [],
    },
    {
      slug: 'media',
      fields: [],
      upload: {
        adminThumbnail: "thumbnail",
        formatOptions: {
          format: "webp",
          options: { quality: 90 },
        },
        imageSizes: [
          {
            name: "thumbnail",
            formatOptions: {
              format: "webp",
              options: { quality: 90 },
            },
            width: 200,
          },
          {
            name: "medium",
            formatOptions: {
              format: "webp",
              options: { quality: 90 },
            },
            width: 800,
          },
          {
            name: "projectBlur",
            formatOptions: {
              format: "webp",
              options: { quality: 30 },
            },
            width: 50,
          },
        ],
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
    },
  ],
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || '',
    },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    payloadFilesProxy({
      mediaCollectionSlug: "media",
      mediaDirectory: path.resolve("./"),
      originUrl: "https://inet2you.itfumh.es"
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
