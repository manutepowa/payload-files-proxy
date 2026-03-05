# Payload Files Proxy

Small Payload CMS plugin to fetch missing media files from an origin site during local development, inspired by Drupal's `stage_file_proxy` approach.

Use this when you do not want to sync a large uploads folder locally but still need media files to appear in pages and the admin UI.

## Install

```bash
npm install payload-files-proxy
# or
pnpm add payload-files-proxy
# or
yarn add payload-files-proxy
```

## Quick Start

```ts
import path from 'path'
import { buildConfig } from 'payload'
import { payloadFilesProxy } from 'payload-files-proxy'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      upload: {
        staticDir: path.resolve('./uploads'),
      },
    },
  ],
  plugins: [
    payloadFilesProxy({
      mediaCollectionSlug: 'media',
      mediaDirectory: path.resolve('./uploads'),
      originUrl: 'https://your-production-site.com',
      disabled: process.env.NODE_ENV === 'production',
    }),
  ],
})
```

## Configuration

`payloadFilesProxy` receives:

- `mediaCollectionSlug?: string`
  - Slug used to find the upload collection in `config.collections`.
  - If omitted or not found, the plugin returns the original config and does nothing.
- `mediaDirectory: string` (required by type)
  - Base fallback directory for file writes.
  - If `collection.upload.staticDir` is truthy, that value is used instead.
  - Otherwise fallback is `${mediaDirectory}/${mediaCollectionSlug}`.
- `originUrl: string`
  - Base URL used to fetch remote files as `originUrl + doc.url`.
- `disabled?: boolean`
  - If `true`, plugin is a no-op and config is returned unchanged.

## Runtime Behavior

Based on the current source (`src/index.ts` and `src/utils.ts`):

1. Plugin runs only when `disabled !== true`.
2. It finds the target collection by `mediaCollectionSlug`.
3. It computes `uploadDir` from `collection.upload.staticDir` or fallback `${mediaDirectory}/${mediaCollectionSlug}`.
4. It sets `mediaCollection.hooks` to include an `afterRead` hook list composed of:
   - previous `afterRead` hooks (if any)
   - `checkIfFileExists(uploadDir, originUrl)`
5. On each document read:
   - if `doc.url` is missing, it returns immediately
   - it prepares a file list from the main file plus `doc.sizes` variants (if present)
   - for each item, it checks local existence using `fs.stat`
   - if missing, it downloads using `fetch(originUrl + file.url)` and writes bytes with `fs.writeFile`

## Important Limitations

- The plugin is triggered by collection document reads, not by direct static file HTTP requests.
- The destination directory must already exist; the code does not create directories.
- Download currently does not validate `response.ok` before writing.
- Remote fetch is anonymous (`fetch` only), so authenticated origins are not supported out of the box.
- There is an in-code note (`@TODO`) indicating `uploadDir` resolution may be incorrect in some setups.
- `mediaCollection.hooks` is reassigned and keeps previous `afterRead`, but other hook groups are not preserved.

## Development vs Production

- Local/dev: enable plugin to auto-pull missing files on demand.
- Production: disable plugin (`disabled: true` or `NODE_ENV` guard).

## Troubleshooting

- Files are not downloaded:
  - confirm the document has `url` and `filename`
  - confirm `mediaCollectionSlug` matches your collection slug
  - confirm `originUrl + doc.url` is reachable
  - confirm local upload directory exists and is writable
- Variants are missing:
  - confirm `doc.sizes[*].url` and `doc.sizes[*].filename` exist
- 404/invalid files saved:
  - check origin response status and body; current implementation writes whatever fetch returns

## Contributing

PRs are welcome. If behavior changes, document migration notes clearly in the README.

## License

MIT

## Acknowledgements

Inspired by Drupal's `stage_file_proxy` module and similar on-demand media proxy patterns.
