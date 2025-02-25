import type { CollectionAfterReadHook } from "payload"

import { stat, writeFile } from "fs/promises"
import path from "path"

export const checkIfFileExists = (uploadDir: string, originUrl: string) => {
  const checkFiles: CollectionAfterReadHook = async ({doc}) => {
    if (!doc.url) {return doc}

    const files = await prepareFiles(doc)
    for (const file of files){
      try {
        await stat(path.resolve(uploadDir, file.filename))
      } catch (error) {
        await downloadFile({ dir: uploadDir, endpoint: file.url, filename: file.filename, originUrl })
      }
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

const prepareFiles = async (doc: any) => {
  const files = [{
    filename: doc.filename,
    url: doc.url,
  }];

  if (!doc.sizes) {return files}

  for (const sizeKey in doc.sizes) {
    files.push({
      filename: doc.sizes[sizeKey].filename,
      url: doc.sizes[sizeKey].url,
    });
  }
  return files;
}
