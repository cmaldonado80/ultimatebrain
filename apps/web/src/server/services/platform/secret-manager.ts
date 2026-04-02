/**
 * Secret Manager — lifecycle management for entity secrets.
 *
 * Handles creation, rotation, revocation, and dual-key windows.
 * Never stores plaintext secrets in the database — only SHA256 hashes
 * and truncated prefixes for identification.
 *
 * Rotation flow:
 *   1. Generate new secret (version N+1)
 *   2. Mark old → 'rotating', new → 'pending_activation'
 *   3. Old key hash kept in previousKeyHash for dual-key window
 *   4. Operator deploys new secret to runtime
 *   5. Verify runtime works with new secret
 *   6. Activate new secret → 'active', revoke old → 'revoked'
 *
 * During the dual-key window, BOTH old and new keys are valid.
 */

import type { Database } from '@solarc/db'
import { brainEntities, entitySecrets } from '@solarc/db'
import { createHash, randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'

import { auditEvent } from './audit'

// ── Types ─────────────────────────────────────────────────────────────

export type SecretType = 'brain_api_key' | 'mini_brain_secret' | 'app_secret' | 'database_url'
export type SecretStatus = 'active' | 'rotating' | 'pending_activation' | 'revoked'

export interface SecretMetadata {
  id: string
  entityId: string
  type: SecretType
  status: SecretStatus
  version: number
  keyPrefix: string | null
  expiresAt: Date | null
  rotationStartedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateSecretResult {
  secretId: string
  plaintextKey: string
  metadata: SecretMetadata
}

// ── Helpers ──────────────────────────────────────────────────────────

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function generateKey(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`
}

function extractPrefix(key: string, len = 8): string {
  return key.slice(0, Math.min(len, key.length)) + '...'
}

// ── Create ───────────────────────────────────────────────────────────

/**
 * Create a new secret for an entity. Returns plaintext ONCE.
 */
export async function createSecret(
  db: Database,
  entityId: string,
  type: SecretType,
  userId: string,
): Promise<CreateSecretResult> {
  // Generate key based on type
  const prefixes: Record<SecretType, string> = {
    brain_api_key: 'sb',
    mini_brain_secret: 'sk',
    app_secret: 'sk',
    database_url: 'db',
  }

  const plaintextKey = generateKey(prefixes[type]!)
  const keyH = hashKey(plaintextKey)
  const prefix = extractPrefix(plaintextKey)

  // Check for existing active secret of same type
  const existing = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, entityId),
      eq(entitySecrets.type, type),
      eq(entitySecrets.status, 'active'),
    ),
  })
  const version = existing ? existing.version + 1 : 1

  const [secret] = await db
    .insert(entitySecrets)
    .values({
      entityId,
      type,
      status: 'active',
      version,
      keyHash: keyH,
      keyPrefix: prefix,
      createdBy: userId,
    })
    .returning()

  if (!secret) throw new Error('Failed to create secret')

  // For brain_api_key, also update brainEntities.apiKeyHash for backward compatibility
  if (type === 'brain_api_key') {
    await db
      .update(brainEntities)
      .set({ apiKeyHash: keyH, updatedAt: new Date() })
      .where(eq(brainEntities.id, entityId))
  }

  await auditEvent(db, userId, 'secret_created', 'entity_secret', secret.id, {
    entityId,
    type,
    version,
  })

  return {
    secretId: secret.id,
    plaintextKey,
    metadata: toMetadata(secret),
  }
}

// ── Rotate ───────────────────────────────────────────────────────────

/**
 * Start rotation: generates new key, puts old in dual-key window.
 * Returns new plaintext key (shown ONCE).
 */
export async function rotateSecret(
  db: Database,
  secretId: string,
  userId: string,
): Promise<CreateSecretResult> {
  const current = await db.query.entitySecrets.findFirst({
    where: eq(entitySecrets.id, secretId),
  })
  if (!current) throw new Error('Secret not found')
  if (current.status !== 'active') throw new Error('Can only rotate active secrets')

  // Generate new key
  const prefixes: Record<string, string> = {
    brain_api_key: 'sb',
    mini_brain_secret: 'sk',
    app_secret: 'sk',
    database_url: 'db',
  }
  const plaintextKey = generateKey(prefixes[current.type] ?? 'sk')
  const newHash = hashKey(plaintextKey)
  const prefix = extractPrefix(plaintextKey)
  const newVersion = current.version + 1

  // Mark current as rotating (keeps its hash valid in dual-key window)
  await db
    .update(entitySecrets)
    .set({
      status: 'rotating',
      rotationStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(entitySecrets.id, secretId))

  // Create new secret as pending_activation
  const [newSecret] = await db
    .insert(entitySecrets)
    .values({
      entityId: current.entityId,
      type: current.type as SecretType,
      status: 'pending_activation',
      version: newVersion,
      keyHash: newHash,
      keyPrefix: prefix,
      previousKeyHash: current.keyHash,
      createdBy: userId,
    })
    .returning()

  if (!newSecret) throw new Error('Failed to create rotated secret')

  // For brain_api_key, update the entity hash to the NEW key
  // (authenticateEntity also checks previousKeyHash during dual-key window)
  if (current.type === 'brain_api_key') {
    await db
      .update(brainEntities)
      .set({ apiKeyHash: newHash, updatedAt: new Date() })
      .where(eq(brainEntities.id, current.entityId))
  }

  await auditEvent(db, userId, 'secret_rotated', 'entity_secret', newSecret.id, {
    entityId: current.entityId,
    type: current.type,
    oldVersion: current.version,
    newVersion,
    oldSecretId: secretId,
  })

  return {
    secretId: newSecret.id,
    plaintextKey,
    metadata: toMetadata(newSecret),
  }
}

// ── Activate ─────────────────────────────────────────────────────────

/**
 * Activate a pending secret and revoke the old rotating one.
 * Call this after verifying the new key works in runtime.
 */
export async function activateSecret(
  db: Database,
  secretId: string,
  userId: string,
): Promise<void> {
  const secret = await db.query.entitySecrets.findFirst({
    where: eq(entitySecrets.id, secretId),
  })
  if (!secret) throw new Error('Secret not found')
  if (secret.status !== 'pending_activation') {
    throw new Error('Can only activate secrets in pending_activation status')
  }

  // Activate the new secret
  await db
    .update(entitySecrets)
    .set({
      status: 'active',
      previousKeyHash: null,
      updatedAt: new Date(),
    })
    .where(eq(entitySecrets.id, secretId))

  // Revoke the old rotating secret
  const oldRotating = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, secret.entityId),
      eq(entitySecrets.type, secret.type),
      eq(entitySecrets.status, 'rotating'),
    ),
  })
  if (oldRotating) {
    await db
      .update(entitySecrets)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(entitySecrets.id, oldRotating.id))
  }

  await auditEvent(db, userId, 'secret_activated', 'entity_secret', secretId, {
    entityId: secret.entityId,
    type: secret.type,
    version: secret.version,
    revokedSecretId: oldRotating?.id,
  })
}

// ── Revoke ───────────────────────────────────────────────────────────

/**
 * Immediately revoke a secret. Use for compromised keys.
 */
export async function revokeSecret(
  db: Database,
  secretId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  const secret = await db.query.entitySecrets.findFirst({
    where: eq(entitySecrets.id, secretId),
  })
  if (!secret) throw new Error('Secret not found')
  if (secret.status === 'revoked') throw new Error('Secret already revoked')

  await db
    .update(entitySecrets)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(eq(entitySecrets.id, secretId))

  // If this was a brain_api_key and it's the current one, clear the entity hash
  if (secret.type === 'brain_api_key') {
    const entity = await db.query.brainEntities.findFirst({
      where: eq(brainEntities.id, secret.entityId),
    })
    if (entity?.apiKeyHash === secret.keyHash) {
      await db
        .update(brainEntities)
        .set({ apiKeyHash: null, updatedAt: new Date() })
        .where(eq(brainEntities.id, secret.entityId))
    }
  }

  await auditEvent(db, userId, 'secret_revoked', 'entity_secret', secretId, {
    entityId: secret.entityId,
    type: secret.type,
    version: secret.version,
    reason,
  })
}

// ── Rollback ─────────────────────────────────────────────────────────

/**
 * Rollback a rotation: reactivate the old key, revoke the new one.
 * Use when runtime verification fails after rotation.
 */
export async function rollbackRotation(
  db: Database,
  newSecretId: string,
  userId: string,
): Promise<void> {
  const newSecret = await db.query.entitySecrets.findFirst({
    where: eq(entitySecrets.id, newSecretId),
  })
  if (!newSecret) throw new Error('Secret not found')
  if (newSecret.status !== 'pending_activation') {
    throw new Error('Can only rollback pending_activation secrets')
  }

  // Revoke the new secret
  await db
    .update(entitySecrets)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(eq(entitySecrets.id, newSecretId))

  // Reactivate the old rotating secret
  const oldRotating = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, newSecret.entityId),
      eq(entitySecrets.type, newSecret.type),
      eq(entitySecrets.status, 'rotating'),
    ),
  })
  if (oldRotating) {
    await db
      .update(entitySecrets)
      .set({
        status: 'active',
        rotationStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(entitySecrets.id, oldRotating.id))

    // Restore entity hash to old key
    if (oldRotating.type === 'brain_api_key' && oldRotating.keyHash) {
      await db
        .update(brainEntities)
        .set({ apiKeyHash: oldRotating.keyHash, updatedAt: new Date() })
        .where(eq(brainEntities.id, oldRotating.entityId))
    }
  }

  await auditEvent(db, userId, 'secret_rollback', 'entity_secret', newSecretId, {
    entityId: newSecret.entityId,
    type: newSecret.type,
    restoredSecretId: oldRotating?.id,
  })
}

// ── Query ────────────────────────────────────────────────────────────

/**
 * List secrets for an entity (metadata only, never hashes).
 */
export async function listSecrets(db: Database, entityId: string): Promise<SecretMetadata[]> {
  const secrets = await db.query.entitySecrets.findMany({
    where: eq(entitySecrets.entityId, entityId),
    orderBy: [desc(entitySecrets.createdAt)],
  })
  return secrets.map(toMetadata)
}

/**
 * Get a single secret's metadata.
 */
export async function getSecretMetadata(
  db: Database,
  secretId: string,
): Promise<SecretMetadata | null> {
  const secret = await db.query.entitySecrets.findFirst({
    where: eq(entitySecrets.id, secretId),
  })
  return secret ? toMetadata(secret) : null
}

/**
 * Check if a key hash matches any active or rotating secret for an entity.
 * Used for dual-key window validation.
 */
export async function validateKeyHash(
  db: Database,
  entityId: string,
  keyHash: string,
): Promise<boolean> {
  // Check active secrets
  const active = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, entityId),
      eq(entitySecrets.keyHash, keyHash),
      eq(entitySecrets.status, 'active'),
    ),
  })
  if (active) return true

  // Check rotating secrets (dual-key window)
  const rotating = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, entityId),
      eq(entitySecrets.keyHash, keyHash),
      eq(entitySecrets.status, 'rotating'),
    ),
  })
  if (rotating) return true

  // Check pending secrets with previousKeyHash (old key during rotation)
  const pending = await db.query.entitySecrets.findFirst({
    where: and(
      eq(entitySecrets.entityId, entityId),
      eq(entitySecrets.previousKeyHash, keyHash),
      eq(entitySecrets.status, 'pending_activation'),
    ),
  })
  return !!pending
}

// ── Helpers ──────────────────────────────────────────────────────────

function toMetadata(s: {
  id: string
  entityId: string
  type: string
  status: string
  version: number
  keyPrefix: string | null
  expiresAt: Date | null
  rotationStartedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): SecretMetadata {
  return {
    id: s.id,
    entityId: s.entityId,
    type: s.type as SecretType,
    status: s.status as SecretStatus,
    version: s.version,
    keyPrefix: s.keyPrefix,
    expiresAt: s.expiresAt,
    rotationStartedAt: s.rotationStartedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}
