# Payload Files Proxy

Small Payload CMS plugin to fetch missing media files from an origin site during local development, inspired by Drupal's `stage_file_proxy` approach.

Use this when you do not want to sync a large uploads folder locally but still need media files to appear in pages and the admin UI.

## Requirements and compatibility

- Node.js `^22.23.4 || >=24.22.1` and Payload CMS `^3.92.0`.
- The development application uses Payload 3.92.0, Next.js 15.4.11, and React / React DOM 19.1.2. Earlier Payload and Node versions are no longer supported by this package.

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
  - If omitted, not found, or not an upload collection, no proxy handler is added.
- `mediaDirectory: string` (required by type)
  - Retained for compatibility; it does not determine where files are written.
  - Payload's runtime `upload.staticDir` is used, falling back to the collection slug.
- `originUrl: string`
  - HTTP(S) origin used with the requested Payload file URL pathname. The origin's path, query, and fragment are ignored.
- `disabled?: boolean`
  - If `true`, plugin is a no-op and config is returned unchanged.

## Runtime Behavior

The plugin appends a file handler without replacing existing handlers. Payload checks read access before calling it. Document reads do not download files: on a file request, the handler checks the runtime local upload directory and fetches only a missing requested file. Payload then serves the local file, including its normal range handling. Image variants are fetched individually when requested.

Downloads are limited to 50 MiB and 15 seconds, require HTTP 200, and reject redirects. Completed downloads are published without overwriting an existing file; concurrent requests in the same process share a download. Failed downloads return HTTP 502 and are not cached.

## Important Limitations

- Requests are anonymous; authenticated origins and redirects are not supported. The origin must serve the same Payload file pathname.
- Configure only a trusted origin: the server makes outbound requests to it. Do not expose this development proxy in production. Downloaded content is trusted and is not scanned or validated as an image.
- Payload's read access controls apply, but boolean public read access can permit requests for filenames without a matching database document. Restrict access and the origin accordingly.
- Local storage must be enabled. The destination is created if necessary and must be writable; storage adapters or handlers that return a response before this handler take precedence.
- Deduplication is process-local. Existing local files are never refreshed, and the 50 MiB limit is buffered in memory.

## Development vs Production

- Local/dev: enable plugin to auto-pull missing files on demand.
- Production: disable plugin (`disabled: true` or `NODE_ENV` guard).

## Troubleshooting

- Files are not downloaded:
  - confirm `mediaCollectionSlug` matches your upload collection and read access permits the request
  - confirm the requested pathname is reachable on `originUrl` without redirects or authentication
  - confirm Payload's local upload directory is writable and local storage is enabled
  - check server logs for origin failures, the size limit, or timeout

## Development and tests

The `dev/` directory contains the Payload development application. Development requires pnpm 11 (the project pins pnpm 11.25.0). Dependency install scripts are allowed only for `sharp`. Integration tests use Vitest, an isolated temporary SQLite database, and a local HTTP origin; they do not need production services.

```bash
pnpm install
DATABASE_URI=file:./dev/local.db PAYLOAD_CONFIG_PATH=./dev/payload.config.ts pnpm dev
```

Open http://localhost:3000/admin. The SQLite URI selects a local database; choose a different file if you want an isolated database. `PAYLOAD_CONFIG_PATH` points Next.js to the development Payload configuration. To regenerate the admin import map after changing components, run:

```bash
DATABASE_URI=file:./dev/local.db PAYLOAD_CONFIG_PATH=./dev/payload.config.ts pnpm dev:generate-importmap
```

The development configuration uses an external origin (`https://inet2you.itfumh.es`); missing files can only be fetched if that origin is reachable and serves the requested paths. Startup and tests do not require production services.

```bash
pnpm test
pnpm test:watch
```

## Contributing

PRs are welcome. If behavior changes, document migration notes clearly in the README.

## License

MIT

## Acknowledgements

Inspired by Drupal's `stage_file_proxy` module and similar on-demand media proxy patterns.
