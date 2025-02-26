import type { CollectionAfterReadHook } from "payload"

import { stat, writeFile } from "fs/promises"

export const checkIfFileExists = (uploadDir: string, originUrl: string) => {
  const checkFiles: CollectionAfterReadHook = async ({doc}) => {
    if (!doc.url) {return doc}

    const files = prepareFiles(doc)
    for (const file of files){
      if (!file.url) {continue}
      const path = `${uploadDir}/${file.filename}`
      try {
        await stat(path)
      } catch (error) {
        await downloadFile({ endpoint: file.url, originUrl, path })
      }
    }

    return doc
  }
  return checkFiles
}


interface DownloadFileOptions {
  endpoint: string
  originUrl: string
  path: string
}
const downloadFile = async ({endpoint, originUrl, path}: DownloadFileOptions) => {
  const response = await fetch(originUrl + endpoint) // Realiza la petición fetch
  // Guarda el archivo en la carpeta especificada
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
}

const prepareFiles = (doc: any) => {
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
