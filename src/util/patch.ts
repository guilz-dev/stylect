export const MAX_PATCH_BYTES = 100 * 1024

export function truncatePatch(patch: string, maxBytes = MAX_PATCH_BYTES): string {
  const buffer = Buffer.from(patch, 'utf8')
  if (buffer.length <= maxBytes) {
    return patch
  }

  let end = maxBytes
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end -= 1
  }

  return buffer.subarray(0, end).toString('utf8')
}
