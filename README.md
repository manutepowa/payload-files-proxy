# PayloadCMS Files Proxy

A PayloadCMS plugin that automatically downloads production media files on-demand during local development, similar to Drupal's [stage_file_proxy](https://www.drupal.org/project/stage_file_proxy) module.

## Overview

When developing locally, you often don't want to download and sync large media directories from production. This plugin solves that by:

- Automatically detecting when media files are missing locally
- Downloading files from production on-demand when they're accessed
- Supporting all image sizes and variations
- Working transparently with your existing media collections

## Installation

```bash
npm install payload-files-proxy
# or
pnpm add payload-files-proxy
# or
yarn add payload-files-proxy
```

## Usage

Add the plugin to your Payload configuration:

```typescript
import { payloadFilesProxy } from 'payload-files-proxy'

export default buildConfig({
  // ... your other config
  plugins: [
    payloadFilesProxy({
      mediaCollectionSlug: 'media', // slug of your media collection
      mediaDirectory: './uploads', // local directory where files are stored
      originUrl: 'https://yourproductionsite.com' // production URL to download from
    })
  ]
})
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mediaCollectionSlug` | `string` | No | Slug of the media collection to proxy. Defaults to finding upload collections automatically |
| `mediaDirectory` | `string` | Yes | Local directory path where media files should be stored |
| `originUrl` | `string` | Yes | Production/staging URL to download missing files from |
| `disabled` | `boolean` | No | Disable the plugin (useful for production environments) |

## Example Configuration

```typescript
import { buildConfig } from 'payload'
import { payloadFilesProxy } from 'payload-files-proxy'
import path from 'path'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      upload: {
        staticDir: path.resolve('./uploads'),
        imageSizes: [
          {
            name: 'thumbnail',
            width: 200,
          },
          {
            name: 'large',
            width: 1200,
          }
        ]
      }
    }
  ],
  plugins: [
    payloadFilesProxy({
      mediaCollectionSlug: 'media',
      mediaDirectory: path.resolve('./uploads'),
      originUrl: 'https://yourproductionsite.com',
      disabled: process.env.NODE_ENV === 'production' // disable in production
    })
  ]
})
```

## How It Works

1. **File Access Detection**: When media documents are read (via API, admin panel, etc.), the plugin checks if the files exist locally
2. **Automatic Download**: If files are missing, they're automatically downloaded from the `originUrl`
3. **Size Variations**: All image sizes and variations are downloaded, not just the original
4. **Transparent Operation**: Once downloaded, files are served normally from your local filesystem

## Environment-Specific Usage

### Development
```typescript
payloadFilesProxy({
  mediaCollectionSlug: 'media',
  mediaDirectory: './uploads',
  originUrl: 'https://production.yoursite.com'
})
```

### Staging (pulling from production)
```typescript
payloadFilesProxy({
  mediaCollectionSlug: 'media', 
  mediaDirectory: './uploads',
  originUrl: 'https://production.yoursite.com'
})
```

### Production (disabled)
```typescript
payloadFilesProxy({
  mediaCollectionSlug: 'media',
  mediaDirectory: './uploads', 
  originUrl: 'https://production.yoursite.com',
  disabled: true // or process.env.NODE_ENV === 'production'
})
```

## Benefits

- **Faster Setup**: No need to download entire media directories for local development
- **Storage Efficient**: Only downloads files you actually access
- **Always Current**: Automatically gets the latest versions of files from production
- **Seamless Integration**: Works transparently with existing PayloadCMS media workflows

## Requirements

- PayloadCMS ^3.17.1
- Node.js ^18.20.2 || >=20.9.0

## Similar Tools

This plugin is inspired by and works similarly to:
- [Drupal's stage_file_proxy](https://www.drupal.org/project/stage_file_proxy)
- WordPress staging file proxy plugins

## License

MIT
