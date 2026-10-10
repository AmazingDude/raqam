/** A failed upload may have stored the immutable object before its response was lost.
 * Confirm the exact owner-scoped hash path through Storage rather than guessing
 * from provider error messages/status codes. Never overwrite an original file.
 */
export async function uploadStored(
  uploadError: unknown,
  lookup: () => Promise<{ data: unknown; error: unknown }>,
): Promise<boolean> {
  if (!uploadError) return true;
  const result = await lookup();
  return !result.error && result.data !== null && result.data !== undefined;
}
