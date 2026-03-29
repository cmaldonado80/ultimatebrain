/**
 * Secrets Router — lifecycle management for entity secrets.
 *
 * Create, rotate, activate, revoke, rollback secrets.
 * Never exposes raw secret values — only metadata.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { assertPermission } from '../services/platform/permissions'
import {
  activateSecret,
  createSecret,
  getSecretMetadata,
  listSecrets,
  revokeSecret,
  rollbackRotation,
  rotateSecret,
  type SecretType,
} from '../services/platform/secret-manager'
import { protectedProcedure, router } from '../trpc'

const secretTypeEnum = z.enum(['brain_api_key', 'mini_brain_secret', 'app_secret', 'database_url'])

export const secretsRouter = router({
  /** List secrets for an entity (metadata only) */
  list: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return listSecrets(ctx.db, input.entityId)
    }),

  /** Get single secret metadata */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const secret = await getSecretMetadata(ctx.db, input.id)
      if (!secret) throw new TRPCError({ code: 'NOT_FOUND', message: 'Secret not found' })
      return secret
    }),

  /** Create a new secret. Returns plaintext ONCE. */
  create: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        type: secretTypeEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const result = await createSecret(
        ctx.db,
        input.entityId,
        input.type as SecretType,
        ctx.session.userId,
      )
      return {
        secretId: result.secretId,
        plaintextKey: result.plaintextKey,
        metadata: result.metadata,
      }
    }),

  /** Start rotation — generates new key, enters dual-key window. Returns new plaintext ONCE. */
  rotate: protectedProcedure
    .input(z.object({ secretId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'rotate_key')
      const result = await rotateSecret(ctx.db, input.secretId, ctx.session.userId)
      return {
        secretId: result.secretId,
        plaintextKey: result.plaintextKey,
        metadata: result.metadata,
      }
    }),

  /** Activate a pending secret and revoke the old one. Call after verifying runtime works. */
  activate: protectedProcedure
    .input(z.object({ secretId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await activateSecret(ctx.db, input.secretId, ctx.session.userId)
      return { activated: true }
    }),

  /** Revoke a secret immediately. Use for compromised keys. */
  revoke: protectedProcedure
    .input(
      z.object({
        secretId: z.string().uuid(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await revokeSecret(ctx.db, input.secretId, ctx.session.userId, input.reason)
      return { revoked: true }
    }),

  /** Rollback a rotation — reactivate old key, revoke new one. */
  rollback: protectedProcedure
    .input(z.object({ secretId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await rollbackRotation(ctx.db, input.secretId, ctx.session.userId)
      return { rolledBack: true }
    }),
})
