/**
 * Intenta interpretar un payload de texto como JSON. Si falla, devuelve el texto original.
 */
export function parseJsonLike(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
