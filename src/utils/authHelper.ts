/**
 * Utility functions for local and Firestore-backed authentication
 */

export interface CustomAuthAccount {
  uid: string;
  email: string;
  passwordHash: string;
  salt: string;
  displayName: string;
  deviceName?: string;
  deviceType?: string;
  avatarColor?: string;
  createdAt: string;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getEmailKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const enc = new TextEncoder();
  const data = enc.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'acc_' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 48);
}

export function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function generateUid(): string {
  return 'u_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
