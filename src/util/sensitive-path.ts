const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /credentials/i,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /id_rsa/,
  /\.secrets/i,
]

export function isSensitivePath(filename: string): boolean {
  const base = filename.split('/').pop() ?? filename
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(base) || pattern.test(filename))
}
