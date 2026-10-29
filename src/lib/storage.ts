import { toAppError } from './errors'
import { EXTENSIONS, optimizeImage, validateFile, type FileRule, type ImageType } from './files'
import { supabase } from './supabase'

type Bucket = FileRule['bucket']

/** Public URL for an object in a public bucket (project-images, profile-assets). */
export function publicUrl(bucket: Exclude<Bucket, 'cv'>, path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/**
 * Validates and uploads a file under a generated, unguessable name.
 * Returns the exact stored path, which callers persist in the database and
 * later use for cleanup.
 */
export async function uploadValidatedFile(file: File, rule: FileRule, folder: string): Promise<{ path: string; size: number }> {
  const check = await validateFile(file, rule)
  if (!check.ok) throw toAppError({ message: check.error }, check.error)

  let blob: Blob = file
  let type = check.type
  if (type !== 'application/pdf') {
    const optimized = await optimizeImage(file, type as ImageType)
    blob = optimized.blob
    type = optimized.type
  }

  const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'files'
  const path = `${safeFolder}/${crypto.randomUUID()}.${EXTENSIONS[type]}`
  const { error } = await supabase.storage.from(rule.bucket).upload(path, blob, {
    contentType: type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw toAppError(error, 'Upload failed. Please try again.')
  return { path, size: blob.size }
}

/** Removes objects by their exact stored paths. Missing paths are ignored. */
export async function removeFiles(bucket: Bucket, paths: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (unique.length === 0) return
  const { error } = await supabase.storage.from(bucket).remove(unique)
  if (error) throw toAppError(error, 'Could not remove the stored file.')
}

/** Best-effort cleanup used after a successful database update. */
export async function removeFilesQuietly(bucket: Bucket, paths: Array<string | null | undefined>): Promise<void> {
  try {
    await removeFiles(bucket, paths)
  } catch (error) {
    console.warn('Storage cleanup failed', error)
  }
}
