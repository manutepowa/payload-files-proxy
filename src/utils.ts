import type { CollectionAfterReadHook } from "payload"

import { stat, writeFile } from "fs/promises"
import path from "path"

export const checkIfFileExists = (uploadDir: string, originUrl: string) => {
  const checkFiles: CollectionAfterReadHook = async ({doc}) => {
    if (!doc.url) {return doc}

    try {
      await stat(path.resolve(uploadDir, doc.filename))
      // await stat(path.resolve(uploadDir, doc.filename))
    } catch (error) {
      await downloadFile({ dir: uploadDir, endpoint: doc.url, filename: doc.filename, originUrl })
    }

    return doc
  }
  return checkFiles
}


interface DownloadFileOptions {
  dir: string
  endpoint: string
  filename: string
  originUrl: string
}
const downloadFile = async ({dir, endpoint, filename, originUrl}: DownloadFileOptions) => {
  const response = await fetch(originUrl + endpoint) // Realiza la petición fetch
  // Guarda el archivo en la carpeta especificada
  await writeFile(dir + '/' + filename, Buffer.from(await response.arrayBuffer()))
}
