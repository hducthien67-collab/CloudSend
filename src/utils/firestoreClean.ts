/**
 * Recursive sanitizer to guarantee no undefined values or fields ever reach Firestore SDK calls
 */
export function cleanFirestoreObject<T = any>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null) return null as any;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  // Preserve Firestore FieldValues (serverTimestamp, arrayUnion, deleteField, etc.)
  if ((obj as any)?._methodName || (obj as any)?.constructor?.name === 'FieldValue') return obj;
  
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreObject(item)) as any;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanFirestoreObject(value);
    }
  }
  return cleaned as T;
}
