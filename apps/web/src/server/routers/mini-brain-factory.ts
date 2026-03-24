/**
 * Mini Brain Factory Router — scaffold and manage Mini Brains and Developments.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { MiniBrainFactory, type MiniBrainTemplate } from '../services/mini-brain-factory/factory'

let _factory: MiniBrainFactory | null = null
function getFactory() {
  return (_factory ??= new MiniBrainFactory())
}

const templateEnum = z.enum([
  'astrology',
  'hospitality',
  'healthcare',
  'legal',
  'marketing',
  'soc-ops',
])

export const miniBrainFactoryRouter = router({
  /** List available Mini Brain templates */
  templates: protectedProcedure.query(() => {
    return getFactory().getTemplates()
  }),

  /** Get a single template definition */
  template: protectedProcedure.input(z.object({ id: templateEnum })).query(({ input }) => {
    return getFactory().getTemplate(input.id as MiniBrainTemplate)
  }),

  /** Get development templates for a Mini Brain template */
  developmentTemplates: protectedProcedure
    .input(z.object({ template: templateEnum }))
    .query(({ input }) => {
      return getFactory().getDevelopmentTemplates(input.template as MiniBrainTemplate)
    }),

  /** Create a new Mini Brain from template */
  create: protectedProcedure
    .input(
      z.object({
        template: templateEnum,
        name: z.string().min(1),
        brainEndpoint: z.string().default('http://localhost:3000'),
        brainApiKey: z.string().default('dev-key'),
        databaseUrl: z.string().optional(),
        targetDir: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return getFactory().createMiniBrain({
        ...input,
        template: input.template as MiniBrainTemplate,
      })
    }),

  /** Create a Development app from a Mini Brain template */
  createDevelopment: protectedProcedure
    .input(
      z.object({
        template: z.string().min(1),
        name: z.string().min(1),
        miniBrainId: z.string().uuid(),
        targetDir: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return getFactory().createDevelopment(input)
    }),
})
