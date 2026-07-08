export function resolveCursorApiKey(explicit?: string): string | undefined {
  if (explicit) {
    return explicit
  }
  return process.env.CURSOR_API_KEY
}
