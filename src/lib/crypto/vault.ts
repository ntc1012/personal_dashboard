// Browser-only encryption. This module intentionally has no imports from server actions or LLM code.
import { z } from 'zod';
import { extraSchemas, type VaultMeta, type VaultItem } from '../modules';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const KDF_ITERATIONS = 600000;
const bytes = (value: string) => {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const base64 = (value: Uint8Array) =>
  btoa(Array.from(value, (b) => String.fromCharCode(b)).join(''));
export async function deriveVaultKey(password: string, salt: string) {
  if (password.length < 12 || password.length > 1024)
    throw new Error('Master password cần ít nhất 12 ký tự.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptVault(key: CryptoKey, plaintext: string, id: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('jarvis-vault-v1:' + id) },
    key,
    encoder.encode(plaintext),
  );
  return {
    ciphertext: base64(new Uint8Array(encrypted)),
    iv: base64(iv),
    cipher_version: 1 as const,
  };
}
export async function decryptVault(
  key: CryptoKey,
  item: { ciphertext: string; iv: string },
  id: string,
) {
  const clear = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes(item.iv),
      additionalData: encoder.encode('jarvis-vault-v1:' + id),
    },
    key,
    bytes(item.ciphertext),
  );
  return decoder.decode(clear);
}
export async function createVault(password: string, id: string) {
  const salt = base64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveVaultKey(password, salt);
  const proof = await encryptVault(key, 'JARVIS_VAULT_VERIFIED_V1', id);
  return {
    key,
    meta: {
      salt,
      iterations: KDF_ITERATIONS as 600000,
      verifier: proof.ciphertext,
      verifier_iv: proof.iv,
      cipher_version: 1 as const,
    },
  };
}
export async function unlockVault(password: string, meta: VaultMeta) {
  extraSchemas.vault_meta.parse(metaFields(meta));
  const key = await deriveVaultKey(password, meta.salt);
  const proof = await decryptVault(
    key,
    { ciphertext: meta.verifier, iv: meta.verifier_iv },
    meta.id,
  );
  if (proof !== 'JARVIS_VAULT_VERIFIED_V1') throw new Error('Không mở được vault.');
  return key;
}
const base = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  archived_at: z.iso.datetime({ offset: true }).nullable(),
});
export const encryptedBackupSchema = z
  .object({
    format: z.literal('jarvis-encrypted-vault-v1'),
    meta: extraSchemas.vault_meta.merge(base),
    items: z.array(extraSchemas.vault_items.merge(base)).max(2000),
  })
  .strict();
export function metaFields(meta: VaultMeta) {
  const { salt, iterations, verifier, verifier_iv, cipher_version } = meta;
  return { salt, iterations, verifier, verifier_iv, cipher_version };
}
export function itemFields(item: VaultItem) {
  const { label, category, location, ciphertext, iv, cipher_version } = item;
  return { label, category, location, ciphertext, iv, cipher_version };
}
