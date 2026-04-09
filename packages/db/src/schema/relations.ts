/**
 * Drizzle Relations — defines all entity relationships for type-safe eager loading.
 *
 * Enables `.with()` queries like:
 *   db.query.tickets.findMany({ with: { assignedAgent: true, comments: true } })
 *
 * This eliminates N+1 query patterns across the entire data layer.
 */

import { relations } from 'drizzle-orm'

import { astrologyCharts, astrologyEngagement, astrologyReports } from './astrology'
import {
  accounts,
  auditEvents,
  organizationMembers,
  organizations,
  sessions,
  userRoles,
  users,
  workspaceMembers,
} from './auth'
import {
  agents,
  projectLog,
  projects,
  ticketComments,
  ticketDependencies,
  ticketExecution,
  ticketProof,
  tickets,
  ticketStatusHistory,
  workspaceBindings,
  workspaceGoals,
  workspaceLifecycleEvents,
  workspaces,
} from './core'
import {
  approvalGates,
  cronJobs,
  ephemeralSwarms,
  receiptActions,
  receiptAnomalies,
  receipts,
  swarmAgents,
} from './execution'
import {
  a2aDelegations,
  agentCards,
  agentReputations,
  agentTaskStates,
  degradationProfiles,
  gatewayMetrics,
  instinctObservations,
  instincts,
  knowledgeExchanges,
  marketListings,
  permissionScopes,
} from './features'
import { artifacts, modelFallbacks, orchestratorRoutes, strategyRuns } from './integrations'
import {
  agentMessages,
  agentSoulVersions,
  agentTrustScores,
  chatMessages,
  chatRuns,
  chatRunSteps,
  chatSessions,
  cognitiveCandidates,
  contextEffectiveness,
  evolutionCycles,
  goalAlignments,
  keyResults,
  memories,
  memoryVectors,
  okrs,
  promptOverlays,
  recommendationEvents,
  recommendationOutcomes,
  runMemoryUsage,
  runQuality,
  soulFragments,
} from './intelligence'
import {
  brainEngineUsage,
  brainEntities,
  brainEntityAgents,
  debateEdges,
  debateElo,
  debateNodes,
  debateSessions,
  deploymentWorkflows,
  entitySecrets,
  incidents,
  tokenBudgets,
  tokenLedger,
} from './platform'

// ══════════════════════════════════════════════════════════════════════
// AUTH RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  roles: many(userRoles),
  workspaceMemberships: many(workspaceMembers),
  organizationMemberships: many(organizationMembers),
  auditEvents: many(auditEvents),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}))

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerUserId], references: [users.id] }),
  members: many(organizationMembers),
}))

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}))

// ══════════════════════════════════════════════════════════════════════
// CORE RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  agents: many(agents),
  tickets: many(tickets),
  bindings: many(workspaceBindings),
  goals: many(workspaceGoals),
  lifecycleEvents: many(workspaceLifecycleEvents),
  members: many(workspaceMembers),
  chatSessions: many(chatSessions),
  promptOverlays: many(promptOverlays),
  memories: many(memories),
  receipts: many(receipts),
  strategyRuns: many(strategyRuns),
  cronJobs: many(cronJobs),
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [agents.workspaceId], references: [workspaces.id] }),
  assignedTickets: many(tickets),
  ticketComments: many(ticketComments),
  chatSessions: many(chatSessions),
  sentMessages: many(agentMessages, { relationName: 'sentMessages' }),
  receivedMessages: many(agentMessages, { relationName: 'receivedMessages' }),
  receipts: many(receipts),
  card: one(agentCards, { fields: [agents.id], references: [agentCards.agentId] }),
  reputation: one(agentReputations, {
    fields: [agents.id],
    references: [agentReputations.agentId],
  }),
  trustScore: one(agentTrustScores, {
    fields: [agents.id],
    references: [agentTrustScores.agentId],
  }),
  degradationProfile: one(degradationProfiles, {
    fields: [agents.id],
    references: [degradationProfiles.agentId],
  }),
  debateElo: one(debateElo, { fields: [agents.id], references: [debateElo.agentId] }),
  taskStates: many(agentTaskStates),
  permissionScopes: many(permissionScopes),
  soulVersions: many(agentSoulVersions),
  evolutionCycles: many(evolutionCycles),
  approvalGates: many(approvalGates),
  modelFallbacks: many(modelFallbacks),
  cronJobs: many(cronJobs),
  swarmMemberships: many(swarmAgents),
  entityAssignments: many(brainEntityAgents),
  delegationsFrom: many(a2aDelegations, { relationName: 'delegationsFrom' }),
  delegationsTo: many(a2aDelegations, { relationName: 'delegationsTo' }),
  artifacts: many(artifacts),
  gatewayMetrics: many(gatewayMetrics),
}))

export const projectsRelations = relations(projects, ({ many }) => ({
  tickets: many(tickets),
  logs: many(projectLog),
  receipts: many(receipts),
  debateSessions: many(debateSessions),
}))

export const projectLogRelations = relations(projectLog, ({ one }) => ({
  project: one(projects, { fields: [projectLog.projectId], references: [projects.id] }),
}))

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [tickets.workspaceId], references: [workspaces.id] }),
  assignedAgent: one(agents, { fields: [tickets.assignedAgentId], references: [agents.id] }),
  project: one(projects, { fields: [tickets.projectId], references: [projects.id] }),
  comments: many(ticketComments),
  statusHistory: many(ticketStatusHistory),
  execution: one(ticketExecution, {
    fields: [tickets.id],
    references: [ticketExecution.ticketId],
  }),
  proof: one(ticketProof, { fields: [tickets.id], references: [ticketProof.ticketId] }),
  dependencies: many(ticketDependencies, { relationName: 'dependentTicket' }),
  blockedBy: many(ticketDependencies, { relationName: 'blockingTicket' }),
  marketListing: one(marketListings, {
    fields: [tickets.id],
    references: [marketListings.ticketId],
  }),
}))

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
  agent: one(agents, { fields: [ticketComments.agentId], references: [agents.id] }),
}))

export const ticketStatusHistoryRelations = relations(ticketStatusHistory, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketStatusHistory.ticketId], references: [tickets.id] }),
}))

export const ticketExecutionRelations = relations(ticketExecution, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketExecution.ticketId], references: [tickets.id] }),
  lockOwnerAgent: one(agents, { fields: [ticketExecution.lockOwner], references: [agents.id] }),
}))

export const ticketProofRelations = relations(ticketProof, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketProof.ticketId], references: [tickets.id] }),
}))

export const ticketDependenciesRelations = relations(ticketDependencies, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketDependencies.ticketId],
    references: [tickets.id],
    relationName: 'dependentTicket',
  }),
  blockedByTicket: one(tickets, {
    fields: [ticketDependencies.blockedByTicketId],
    references: [tickets.id],
    relationName: 'blockingTicket',
  }),
}))

export const workspaceBindingsRelations = relations(workspaceBindings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceBindings.workspaceId],
    references: [workspaces.id],
  }),
}))

export const workspaceGoalsRelations = relations(workspaceGoals, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceGoals.workspaceId], references: [workspaces.id] }),
}))

export const workspaceLifecycleEventsRelations = relations(workspaceLifecycleEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceLifecycleEvents.workspaceId],
    references: [workspaces.id],
  }),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}))

// ══════════════════════════════════════════════════════════════════════
// EXECUTION RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const cronJobsRelations = relations(cronJobs, ({ one }) => ({
  workspace: one(workspaces, { fields: [cronJobs.workspaceId], references: [workspaces.id] }),
  agent: one(agents, { fields: [cronJobs.agentId], references: [agents.id] }),
}))

export const ephemeralSwarmsRelations = relations(ephemeralSwarms, ({ many }) => ({
  members: many(swarmAgents),
}))

export const swarmAgentsRelations = relations(swarmAgents, ({ one }) => ({
  swarm: one(ephemeralSwarms, { fields: [swarmAgents.swarmId], references: [ephemeralSwarms.id] }),
  agent: one(agents, { fields: [swarmAgents.agentId], references: [agents.id] }),
}))

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  agent: one(agents, { fields: [receipts.agentId], references: [agents.id] }),
  ticket: one(tickets, { fields: [receipts.ticketId], references: [tickets.id] }),
  project: one(projects, { fields: [receipts.projectId], references: [projects.id] }),
  workspace: one(workspaces, { fields: [receipts.workspaceId], references: [workspaces.id] }),
  actions: many(receiptActions),
  anomalies: many(receiptAnomalies),
}))

export const receiptActionsRelations = relations(receiptActions, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptActions.receiptId], references: [receipts.id] }),
}))

export const receiptAnomaliesRelations = relations(receiptAnomalies, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptAnomalies.receiptId], references: [receipts.id] }),
}))

export const approvalGatesRelations = relations(approvalGates, ({ one }) => ({
  agent: one(agents, { fields: [approvalGates.agentId], references: [agents.id] }),
}))

// ══════════════════════════════════════════════════════════════════════
// FEATURES RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const instinctsRelations = relations(instincts, ({ many }) => ({
  observations: many(instinctObservations),
}))

export const instinctObservationsRelations = relations(instinctObservations, ({ one }) => ({
  instinct: one(instincts, {
    fields: [instinctObservations.instinctId],
    references: [instincts.id],
  }),
}))

export const a2aDelegationsRelations = relations(a2aDelegations, ({ one }) => ({
  fromAgent: one(agents, {
    fields: [a2aDelegations.fromAgentId],
    references: [agents.id],
    relationName: 'delegationsFrom',
  }),
  toAgent: one(agents, {
    fields: [a2aDelegations.toAgentId],
    references: [agents.id],
    relationName: 'delegationsTo',
  }),
}))

export const agentCardsRelations = relations(agentCards, ({ one }) => ({
  agent: one(agents, { fields: [agentCards.agentId], references: [agents.id] }),
}))

export const degradationProfilesRelations = relations(degradationProfiles, ({ one }) => ({
  agent: one(agents, { fields: [degradationProfiles.agentId], references: [agents.id] }),
}))

export const agentTaskStatesRelations = relations(agentTaskStates, ({ one }) => ({
  agent: one(agents, { fields: [agentTaskStates.agentId], references: [agents.id] }),
}))

export const permissionScopesRelations = relations(permissionScopes, ({ one }) => ({
  agent: one(agents, { fields: [permissionScopes.agentId], references: [agents.id] }),
}))

export const marketListingsRelations = relations(marketListings, ({ one }) => ({
  ticket: one(tickets, { fields: [marketListings.ticketId], references: [tickets.id] }),
  winner: one(agents, { fields: [marketListings.winnerId], references: [agents.id] }),
}))

export const agentReputationsRelations = relations(agentReputations, ({ one }) => ({
  agent: one(agents, { fields: [agentReputations.agentId], references: [agents.id] }),
}))

export const knowledgeExchangesRelations = relations(knowledgeExchanges, ({ one }) => ({
  askingAgent: one(agents, {
    fields: [knowledgeExchanges.askingAgentId],
    references: [agents.id],
  }),
}))

export const gatewayMetricsRelations = relations(gatewayMetrics, ({ one }) => ({
  agent: one(agents, { fields: [gatewayMetrics.agentId], references: [agents.id] }),
}))

// ══════════════════════════════════════════════════════════════════════
// INTELLIGENCE RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  agent: one(agents, { fields: [chatSessions.agentId], references: [agents.id] }),
  workspace: one(workspaces, {
    fields: [chatSessions.workspaceId],
    references: [workspaces.id],
  }),
  messages: many(chatMessages),
  runs: many(chatRuns),
  recommendationEvents: many(recommendationEvents),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
}))

export const chatRunsRelations = relations(chatRuns, ({ one, many }) => ({
  session: one(chatSessions, { fields: [chatRuns.sessionId], references: [chatSessions.id] }),
  steps: many(chatRunSteps),
  memoryUsage: many(runMemoryUsage),
  quality: one(runQuality, { fields: [chatRuns.id], references: [runQuality.runId] }),
}))

export const chatRunStepsRelations = relations(chatRunSteps, ({ one }) => ({
  run: one(chatRuns, { fields: [chatRunSteps.runId], references: [chatRuns.id] }),
  agent: one(agents, { fields: [chatRunSteps.agentId], references: [agents.id] }),
}))

export const runMemoryUsageRelations = relations(runMemoryUsage, ({ one }) => ({
  run: one(chatRuns, { fields: [runMemoryUsage.runId], references: [chatRuns.id] }),
}))

export const memoriesRelations = relations(memories, ({ one, many }) => ({
  sourceAgent: one(agents, { fields: [memories.source], references: [agents.id] }),
  workspace: one(workspaces, { fields: [memories.workspaceId], references: [workspaces.id] }),
  vector: one(memoryVectors, { fields: [memories.id], references: [memoryVectors.memoryId] }),
  effectivenessScores: many(contextEffectiveness),
  candidates: many(cognitiveCandidates),
}))

export const memoryVectorsRelations = relations(memoryVectors, ({ one }) => ({
  memory: one(memories, { fields: [memoryVectors.memoryId], references: [memories.id] }),
}))

export const contextEffectivenessRelations = relations(contextEffectiveness, ({ one }) => ({
  memory: one(memories, { fields: [contextEffectiveness.memoryId], references: [memories.id] }),
}))

export const cognitiveCandidatesRelations = relations(cognitiveCandidates, ({ one }) => ({
  memory: one(memories, { fields: [cognitiveCandidates.memoryId], references: [memories.id] }),
}))

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  fromAgent: one(agents, {
    fields: [agentMessages.fromAgentId],
    references: [agents.id],
    relationName: 'sentMessages',
  }),
  toAgent: one(agents, {
    fields: [agentMessages.toAgentId],
    references: [agents.id],
    relationName: 'receivedMessages',
  }),
}))

export const agentTrustScoresRelations = relations(agentTrustScores, ({ one }) => ({
  agent: one(agents, { fields: [agentTrustScores.agentId], references: [agents.id] }),
}))

export const agentSoulVersionsRelations = relations(agentSoulVersions, ({ one }) => ({
  agent: one(agents, { fields: [agentSoulVersions.agentId], references: [agents.id] }),
}))

export const evolutionCyclesRelations = relations(evolutionCycles, ({ one }) => ({
  agent: one(agents, { fields: [evolutionCycles.agentId], references: [agents.id] }),
}))

export const soulFragmentsRelations = relations(soulFragments, ({ one }) => ({
  sourceAgent: one(agents, { fields: [soulFragments.sourceAgentId], references: [agents.id] }),
  workspace: one(workspaces, { fields: [soulFragments.workspaceId], references: [workspaces.id] }),
}))

export const recommendationEventsRelations = relations(recommendationEvents, ({ one, many }) => ({
  session: one(chatSessions, {
    fields: [recommendationEvents.sessionId],
    references: [chatSessions.id],
  }),
  outcomes: many(recommendationOutcomes),
}))

export const recommendationOutcomesRelations = relations(recommendationOutcomes, ({ one }) => ({
  event: one(recommendationEvents, {
    fields: [recommendationOutcomes.eventId],
    references: [recommendationEvents.id],
  }),
}))

export const runQualityRelations = relations(runQuality, ({ one }) => ({
  run: one(chatRuns, { fields: [runQuality.runId], references: [chatRuns.id] }),
}))

export const promptOverlaysRelations = relations(promptOverlays, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [promptOverlays.workspaceId],
    references: [workspaces.id],
  }),
}))

// ══════════════════════════════════════════════════════════════════════
// INTEGRATIONS RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  ticket: one(tickets, { fields: [artifacts.ticketId], references: [tickets.id] }),
  agent: one(agents, { fields: [artifacts.agentId], references: [agents.id] }),
}))

export const strategyRunsRelations = relations(strategyRuns, ({ one }) => ({
  agent: one(agents, { fields: [strategyRuns.agentId], references: [agents.id] }),
  workspace: one(workspaces, {
    fields: [strategyRuns.workspaceId],
    references: [workspaces.id],
  }),
}))

export const modelFallbacksRelations = relations(modelFallbacks, ({ one }) => ({
  agent: one(agents, { fields: [modelFallbacks.agentId], references: [agents.id] }),
}))

export const orchestratorRoutesRelations = relations(orchestratorRoutes, ({ one }) => ({
  fromWorkspace: one(workspaces, {
    fields: [orchestratorRoutes.fromWorkspace],
    references: [workspaces.id],
    relationName: 'routesFrom',
  }),
  toWorkspace: one(workspaces, {
    fields: [orchestratorRoutes.toWorkspace],
    references: [workspaces.id],
    relationName: 'routesTo',
  }),
  orchestrator: one(agents, {
    fields: [orchestratorRoutes.orchestratorId],
    references: [agents.id],
  }),
}))

// ══════════════════════════════════════════════════════════════════════
// PLATFORM RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const brainEntitiesRelations = relations(brainEntities, ({ one, many }) => ({
  parent: one(brainEntities, {
    fields: [brainEntities.parentId],
    references: [brainEntities.id],
    relationName: 'entityHierarchy',
  }),
  children: many(brainEntities, { relationName: 'entityHierarchy' }),
  agents: many(brainEntityAgents),
  engineUsage: many(brainEngineUsage),
  deploymentWorkflows: many(deploymentWorkflows),
  secrets: many(entitySecrets),
  tokenLedger: many(tokenLedger),
  tokenBudget: one(tokenBudgets, {
    fields: [brainEntities.id],
    references: [tokenBudgets.entityId],
  }),
}))

export const brainEntityAgentsRelations = relations(brainEntityAgents, ({ one }) => ({
  entity: one(brainEntities, {
    fields: [brainEntityAgents.entityId],
    references: [brainEntities.id],
  }),
  agent: one(agents, { fields: [brainEntityAgents.agentId], references: [agents.id] }),
}))

export const brainEngineUsageRelations = relations(brainEngineUsage, ({ one }) => ({
  entity: one(brainEntities, {
    fields: [brainEngineUsage.entityId],
    references: [brainEntities.id],
  }),
}))

export const debateSessionsRelations = relations(debateSessions, ({ one, many }) => ({
  project: one(projects, { fields: [debateSessions.projectId], references: [projects.id] }),
  nodes: many(debateNodes),
}))

export const debateNodesRelations = relations(debateNodes, ({ one, many }) => ({
  session: one(debateSessions, {
    fields: [debateNodes.sessionId],
    references: [debateSessions.id],
  }),
  agent: one(agents, { fields: [debateNodes.agentId], references: [agents.id] }),
  parent: one(debateNodes, {
    fields: [debateNodes.parentId],
    references: [debateNodes.id],
    relationName: 'nodeHierarchy',
  }),
  children: many(debateNodes, { relationName: 'nodeHierarchy' }),
  outgoingEdges: many(debateEdges, { relationName: 'edgesFrom' }),
  incomingEdges: many(debateEdges, { relationName: 'edgesTo' }),
}))

export const debateEdgesRelations = relations(debateEdges, ({ one }) => ({
  fromNode: one(debateNodes, {
    fields: [debateEdges.fromNodeId],
    references: [debateNodes.id],
    relationName: 'edgesFrom',
  }),
  toNode: one(debateNodes, {
    fields: [debateEdges.toNodeId],
    references: [debateNodes.id],
    relationName: 'edgesTo',
  }),
}))

export const debateEloRelations = relations(debateElo, ({ one }) => ({
  agent: one(agents, { fields: [debateElo.agentId], references: [agents.id] }),
}))

export const tokenLedgerRelations = relations(tokenLedger, ({ one }) => ({
  entity: one(brainEntities, { fields: [tokenLedger.entityId], references: [brainEntities.id] }),
  agent: one(agents, { fields: [tokenLedger.agentId], references: [agents.id] }),
}))

export const tokenBudgetsRelations = relations(tokenBudgets, ({ one }) => ({
  entity: one(brainEntities, { fields: [tokenBudgets.entityId], references: [brainEntities.id] }),
}))

export const deploymentWorkflowsRelations = relations(deploymentWorkflows, ({ one }) => ({
  entity: one(brainEntities, {
    fields: [deploymentWorkflows.entityId],
    references: [brainEntities.id],
  }),
  devEntity: one(brainEntities, {
    fields: [deploymentWorkflows.devEntityId],
    references: [brainEntities.id],
  }),
  triggeredByUser: one(users, {
    fields: [deploymentWorkflows.triggeredBy],
    references: [users.id],
  }),
}))

export const entitySecretsRelations = relations(entitySecrets, ({ one }) => ({
  entity: one(brainEntities, {
    fields: [entitySecrets.entityId],
    references: [brainEntities.id],
  }),
  createdByUser: one(users, { fields: [entitySecrets.createdBy], references: [users.id] }),
}))

export const incidentsRelations = relations(incidents, ({ one }) => ({
  acknowledgedByUser: one(users, {
    fields: [incidents.acknowledgedBy],
    references: [users.id],
  }),
  resolvedByUser: one(users, { fields: [incidents.resolvedBy], references: [users.id] }),
}))

// ══════════════════════════════════════════════════════════════════════
// ASTROLOGY RELATIONS
// ══════════════════════════════════════════════════════════════════════

export const astrologyChartsRelations = relations(astrologyCharts, ({ many }) => ({
  reports: many(astrologyReports),
  engagement: many(astrologyEngagement),
}))

export const astrologyReportsRelations = relations(astrologyReports, ({ one }) => ({
  chart: one(astrologyCharts, {
    fields: [astrologyReports.chartId],
    references: [astrologyCharts.id],
  }),
}))

export const astrologyEngagementRelations = relations(astrologyEngagement, ({ one }) => ({
  chart: one(astrologyCharts, {
    fields: [astrologyEngagement.chartId],
    references: [astrologyCharts.id],
  }),
}))

// ── Strategic Goal Cascade ──────────────────────────────────────────────

export const okrsRelations = relations(okrs, ({ many }) => ({
  keyResults: many(keyResults),
  alignments: many(goalAlignments),
}))

export const keyResultsRelations = relations(keyResults, ({ one }) => ({
  okr: one(okrs, { fields: [keyResults.okrId], references: [okrs.id] }),
}))

export const goalAlignmentsRelations = relations(goalAlignments, ({ one }) => ({
  okr: one(okrs, { fields: [goalAlignments.okrId], references: [okrs.id] }),
  keyResult: one(keyResults, {
    fields: [goalAlignments.keyResultId],
    references: [keyResults.id],
  }),
}))
