/**
 * AES-256-GCM encrypted key vault for LLM provider API keys.
 * Keys are encrypted at rest in the api_keys table.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { apiKeys } from '@solarc/db'
import type { Database } from '@solarc/db'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32

/**
 * Derives a 256-bit key from a passphrase using scrypt.
 * In production, VAULT_SECRET should be a strong secret from env/KMS.
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32)
}

function getVaultSecret(): string {
  const secret = process.env.VAULT_SECRET
  if (!secret) throw new Error('VAULT_SECRET environment variable is required for key vault operations')
  return secret
}

/** Encrypt a plaintext API key. Returns base64-encoded ciphertext (salt:iv:tag:encrypted). */
function encrypt(plaintext: string): string {
  const secret = getVaultSecret()
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(secret, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Pack as salt:iv:tag:ciphertext
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
}

/** Decrypt a base64-encoded ciphertext. Returns plaintext API key. */
function decrypt(encoded: string): string {
  const secret = getVaultSecret()
  const data = Buffer.from(encoded, 'base64')

  const salt = data.subarray(0, SALT_LENGTH)
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(secret, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

export class KeyVault {
  private cache = new Map<string, { key: string; fetchedAt: number }>()
  private cacheTtlMs = 5 * 60 * 1000 // 5 minute cache

  constructor(private db: Database) {}

  /** Store an encrypted API key for a provider */
  async storeKey(provider: string, apiKey: string): Promise<void> {
    const encryptedKey = encrypt(apiKey)

    // Upsert: delete old key for provider, insert new
    await this.db.delete(apiKeys).where(eq(apiKeys.provider, provider))
    await this.db.insert(apiKeys).values({ provider, encryptedKey })

    // Invalidate cache
    this.cache.delete(provider)
  }

  /** Retrieve and decrypt an API key for a provider */
  async getKey(provider: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(provider)
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.key
    }

    const rows = await this.db
      .select({ encryptedKey: apiKeys.encryptedKey })
      .from(apiKeys)
      .where(eq(apiKeys.provider, provider))
      .limit(1)

    if (rows.length === 0) return null

    const key = decrypt(rows[0].encryptedKey)
    this.cache.set(provider, { key, fetchedAt: Date.now() })
    return key
  }

  /** Rotate a key: store new one, invalidate cache */
  async rotateKey(provider: string, newApiKey: string): Promise<void> {
    await this.storeKey(provider, newApiKey)
  }

  /** Delete a key */
  async deleteKey(provider: string): Promise<void> {
    await this.db.delete(apiKeys).where(eq(apiKeys.provider, provider))
    this.cache.delete(provider)
  }

  /** List all providers that have stored keys (no decryption) */
  async listProviders(): Promise<Array<{ provider: string; createdAt: Date }>> {
    return this.db
      .select({ provider: apiKeys.provider, createdAt: apiKeys.createdAt })
      .from(apiKeys)
  }

  /** Clear the in-memory cache (for testing/security) */
  clearCache(): void {
    this.cache.clear()
  }
}
