/** Unambiguous lowercase alphabet (no 0/o, 1/l/i). Matches the SQL generator. */
export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const SLUG_LENGTH = 8

export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('')
}
