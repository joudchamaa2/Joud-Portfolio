/**
 * Client-side file validation. The storage buckets enforce size and MIME
 * limits server-side; these checks give immediate feedback and also verify the
 * file's actual signature (magic bytes), so a renamed file or a spoofed
 * Content-Type is rejected. Client-supplied filenames are never used for
 * storage paths.
 */

const MB = 1024 * 1024

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]
export type AllowedType = ImageType | 'application/pdf'

export type FileRule = {
  bucket: 'project-images' | 'profile-assets' | 'cv'
  types: readonly AllowedType[]
  maxBytes: number
  label: string
}

export const FILE_RULES = {
  projectImage: { bucket: 'project-images', types: IMAGE_TYPES, maxBytes: 5 * MB, label: 'JPEG, PNG or WebP up to 5 MB' },
  profileAsset: { bucket: 'profile-assets', types: IMAGE_TYPES, maxBytes: 2 * MB, label: 'JPEG, PNG or WebP up to 2 MB' },
  cv: { bucket: 'cv', types: ['application/pdf'], maxBytes: 5 * MB, label: 'PDF up to 5 MB' },
} as const satisfies Record<string, FileRule>

export const EXTENSIONS: Record<AllowedType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

async function readHeader(file: Blob, length = 16): Promise<Uint8Array> {
  const buffer = await file.slice(0, length).arrayBuffer()
  return new Uint8Array(buffer)
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b)

/** Detects the real type from the file signature, ignoring name and declared type. */
export async function sniffFileType(file: Blob): Promise<AllowedType | null> {
  const h = await readHeader(file)
  if (startsWith(h, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(h, [0x52, 0x49, 0x46, 0x46]) && startsWith(h, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  if (startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

export type FileCheck = { ok: true; type: AllowedType } | { ok: false; error: string }

export async function validateFile(file: Blob, rule: FileRule): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, error: 'The file is empty.' }
  if (file.size > rule.maxBytes) {
    return { ok: false, error: `The file is ${formatBytes(file.size)}. The maximum is ${formatBytes(rule.maxBytes)}.` }
  }
  const type = await sniffFileType(file)
  if (!type || !rule.types.includes(type)) {
    return { ok: false, error: `Unsupported file. Allowed: ${rule.label}.` }
  }
  return { ok: true, type }
}

/**
 * Downscales large images and re-encodes them as WebP in the browser. This
 * shrinks uploads and strips metadata such as GPS EXIF data. Falls back to the
 * original file when the browser cannot decode or encode the image, or when
 * re-encoding would not make it smaller.
 */
export async function optimizeImage(
  file: Blob,
  type: ImageType,
  maxDimension = 2000,
  quality = 0.86,
): Promise<{ blob: Blob; type: ImageType }> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return { blob: file, type }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file, type }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    if (!blob || blob.type !== 'image/webp') return { blob: file, type }
    if (blob.size >= file.size && scale === 1) return { blob: file, type }
    return { blob, type: 'image/webp' }
  } catch {
    return { blob: file, type }
  }
}
