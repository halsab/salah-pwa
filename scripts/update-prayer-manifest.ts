import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRAYER_DATASET_FILE_NAME,
  PRAYER_MANIFEST_FILE_NAME,
  writePrayerDatasetManifest,
} from './prayerDatasetArtifacts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = path.join(root, 'public', 'data')
const datasetPath = path.join(dataDirectory, PRAYER_DATASET_FILE_NAME)
const manifestPath = path.join(dataDirectory, PRAYER_MANIFEST_FILE_NAME)

const manifest = await writePrayerDatasetManifest(datasetPath, manifestPath)

console.log(`Сохранён manifest набора ${manifest.version}: ${manifestPath}`)
