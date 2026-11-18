/** Object keys are relative, forward-slash paths such as `processed/<org>/<id>.jpg`. */
export function assertSafeKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return key;
}
