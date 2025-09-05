# Payload Files Proxy

A small PayloadCMS plugin that fetches missing production media files on demand during local development — equivalent in purpose to Drupal's stage_file_proxy module.

This plugin is useful when you don't want to clone or sync a large uploads directory locally but still need media to appear when you open pages or the admin UI.

Table of contents

- Quick start
- Configuration options
- Usage examples
- How it works (implementation notes)
- Technical details (source-code mapping)
- Limitations & best practices
- Troubleshooting
- Extending the plugin
- Contributing
- License

Quick start

Install

```bash
npm install payload-files-proxy
# or
pnpm add payload-files-proxy
# or
yarn add payload-files-proxy
```

Minimal usage

```ts
import path from 'path'
import { payloadFilesProxy } from 'payload-files-proxy'

export default buildConfig({
  // ... your config
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

Configuration options

- mediaCollectionSlug: string (recommended)

  - The slug of the upload collection (for example: "media", "uploads").
  - Note: the plugin locates the collection using this slug. If no collection matches, the plugin will silently return the original Payload config and do nothing.

- mediaDirectory: string (required unless your collection's upload.staticDir is set to a usable path)

  - Base directory on disk to write downloaded files. The plugin will use collection.upload.staticDir if present and truthy; otherwise it falls back to `${mediaDirectory}/${mediaCollectionSlug}`.

- originUrl: string (required)

  - Base URL of the origin site that hosts production files. The plugin will perform fetch(originUrl + endpoint) where endpoint is the file record's `doc.url`. In practice doc.url is usually root-relative (e.g. `/media/uploads/xyz.jpg`).

- disabled?: boolean
  - When true the plugin leaves your Payload config unchanged. Recommended for production.

Usage examples

Example: a media collection with local staticDir

```ts
import path from 'path'
import { payloadFilesProxy } from 'payload-files-proxy'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      upload: {
        staticDir: path.resolve('./uploads'),
        imageSizes: [
          { name: 'thumbnail', width: 200 },
          { name: 'large', width: 1200 },
        ],
      },
    },
  ],
  plugins: [
    payloadFilesProxy({
      mediaCollectionSlug: 'media',
      mediaDirectory: path.resolve('./uploads'),
      originUrl: 'https://www.example.com',
      disabled: process.env.NODE_ENV === 'production',
    }),
  ],
})
```

Development vs production

- Development / local: enable the plugin so files are pulled when you open pages or the admin UI.
- Production: disable the plugin (set `disabled: true` or use `process.env.NODE_ENV === 'production'`).

How it works (high-level)

1. The plugin factory payloadFilesProxy(pluginOptions) returns a function that receives your Payload config and mutates the collection with slug === pluginOptions.mediaCollectionSlug.
2. It computes an upload directory path from the collection's upload.staticDir (if present) or from pluginOptions.mediaDirectory + '/' + mediaCollectionSlug.
3. It appends a Collection afterRead hook that runs whenever that collection's document is read.
4. The hook checks the document's file metadata (doc.url and doc.filename). If the local file is missing, it downloads the file from originUrl + doc.url and saves it to the computed upload directory.
5. The hook also attempts to download image sizes/variations by iterating doc.sizes if present.

Technical details (source-code mapping)

Files to inspect in the source tree:

- src/index.ts

  - Exports payloadFilesProxy. Important behaviors:
    - If pluginOptions.disabled is true the original config is returned immediately.
    - It finds the collection via config.collections.find(c => c.slug === pluginOptions.mediaCollectionSlug).
    - It computes uploadDir as `mediaCollection.upload?.staticDir || pluginOptions.mediaDirectory + '/' + pluginOptions.mediaCollectionSlug`.
    - It assigns `mediaCollection.hooks = { afterRead: [ ...(mediaCollection?.hooks?.afterRead || []), checkIfFileExists(uploadDir, pluginOptions.originUrl) ] }`.
      - Note: this assignment keeps existing afterRead hooks but replaces the whole hooks object. Other hook types (beforeValidate, afterChange, etc.) will be lost unless you merge them yourself. See "Limitations & best practices" below.

- src/utils.ts
  - Exports checkIfFileExists(uploadDir, originUrl) which returns a CollectionAfterReadHook.
  - Hook behavior (implementation):
    - If doc.url is falsy the hook returns early.
    - `prepareFiles(doc)` builds an array with the original file (`{ filename: doc.filename, url: doc.url }`) and any variants from `doc.sizes`.
    - For each file it checks filesystem existence with `await stat(path)` where `path = `${uploadDir}/${file.filename}``.
    - If stat fails it calls `downloadFile({ endpoint: file.url, originUrl, path })`.
    - `downloadFile` performs `fetch(originUrl + endpoint)` and writes the full response body to disk with `fs.promises.writeFile(path, Buffer.from(await response.arrayBuffer()))`.

Important runtime notes from the implementation

- The download uses the global `fetch` API (Node 18+ provides fetch). If you run on older Node versions you must provide a polyfill.
- There is no check of `response.ok` or response status; the response body is written to disk as-is. A 404 HTML page could be saved if the origin responds with an error body.
- Filenames and URLs are taken from the Payload file document shape: `doc.filename`, `doc.url` and `doc.sizes`. The plugin expects `doc.url` to be a path that can be concatenated with originUrl (commonly a root-relative path).

Limitations & best practices

- Run only in development/local environments. Do not enable in production — set `disabled: true` in production.
- The plugin locates the collection by `mediaCollectionSlug`. If you omit that option the plugin will not find a collection and will do nothing.
- The plugin assumes local filesystem storage (staticDir). It is not an S3 or cloud-storage proxy out-of-the-box. For cloud storage you need to implement a different strategy or extend the plugin.
- The plugin attaches a collection `afterRead` hook. This means it runs when the Payload document is read (for example through the API or admin UI). If your site serves files directly from disk by URL without reading the Payload document first, the plugin will not be triggered.
- The plugin currently overwrites the collection.hooks object and only preserves existing afterRead hooks. Other hook types will be lost. If you rely on other hooks, merge them manually after the plugin runs or open a PR to change this behavior.
- There is no HTTP error handling / retry logic. The plugin will write whatever the origin returns. You may see invalid files if the origin returns a 404/500 page. Consider extending downloadFile to check `response.ok` and handle errors.
- Concurrency: simultaneous requests for the same missing file can race. The plugin does not perform locking or atomic temporary-file writes. Consider adding a lock or writing to a temp file then renaming.
- Authentication: the current implementation performs unauthenticated GET requests. If your origin requires auth or signed URLs you will need to extend the plugin to add headers or use a custom fetch function.

Troubleshooting

- Files are not being downloaded

  - Confirm the plugin is registered in your Payload config and `mediaCollectionSlug` matches the collection slug.
  - Ensure the collection `afterRead` hook runs (e.g., fetch the document using the API) — the plugin runs after a document read, not when the static file URL is requested directly.
  - Verify `originUrl` and `doc.url` form a valid URL: try `curl -I "${originUrl}${doc.url}"` to see HTTP status.
  - Make sure `mediaDirectory` or the collection's `upload.staticDir` points to an existing directory and that the process has write permissions.
  - Check Node version: Node 18+ is required for built-in fetch or provide a polyfill.

- Permission denied or EACCES

  - Verify filesystem permissions on the upload directory.
  - Create the directory beforehand or ensure the user running the server has write access.

- 404 or unexpected files saved

  - The plugin writes the raw response body. If the origin returns an HTML 404 page, you may get a corrupted media file. Update `src/utils.ts` to check `response.ok` and skip writing on non-2xx responses.

- Other hooks disappeared from your collection config
  - The current plugin implementation replaces `mediaCollection.hooks` with an object containing `afterRead`. Manually merge your other hooks back into the collection or modify the plugin to preserve them.

Extending the plugin

Common improvements you may want to add:

- Check HTTP response status and only write files on 2xx.
- Support custom headers (Authorization, API keys) or allow a custom fetch implementation.
- Add retry/backoff and timeouts.
- Implement atomic file writes (write to `.tmp` + rename) and simple lock/mutexing for downloads.
- Preserve the full hooks object instead of replacing it.

A sketch for a safer download implementation (conceptual):

- Use `const res = await fetch(url, { headers })`, then `if (!res.ok) throw new Error(...)`.
- Create parent directory if missing.
- Write to a temp path e.g. `${path}.partial`, then fs.rename to final filename.
- Optionally store a short-term lock to avoid duplicate downloads.

Contributing

PRs welcome. The repository already includes build/test scripts in package.json (build / dev / test). If you change behavior that affects consumers, please add clear migration notes.

License

MIT

Acknowledgements

Inspired by Drupal's stage_file_proxy module and several similar staging/file-proxy approaches used in other CMS systems.

If you want help adapting or extending this plugin for cloud storage, authenticated origins, or more robust error handling, open an issue or a PR — happy to help.
