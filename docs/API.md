# Solarc Brain API Reference

## Authentication

- POST /api/auth/signin — Sign in with email
- POST /api/auth/signout — Clear session
- POST /api/auth/refresh — Rotate access + refresh tokens

## tRPC Endpoints (POST /api/trpc/[procedure])

### Agents

- agents.list — List all agents (paginated)
- agents.byId — Get agent by ID
- agents.byWorkspace — List agents in a workspace
- agents.create — Create a new agent
- agents.update — Update agent fields

### Workspaces

- workspaces.list — List all workspaces (paginated)
- workspaces.byId — Get workspace by ID
- workspaces.create — Create a new workspace

### Tickets

- tickets.list — List tickets with optional filters (status, workspace)
- tickets.byId — Get ticket by ID
- tickets.create — Create a new ticket
- tickets.update — Update ticket fields
- tickets.updateStatus — Transition ticket status

### Projects

- projects.list — List all projects (paginated)
- projects.byId — Get project by ID
- projects.create — Create a new project
- projects.update — Update project fields
- projects.delete — Delete a project

### Intelligence

- intelligence.features — List all feature flags
- intelligence.setFeature — Toggle a feature flag
- intelligence.isFeatureEnabled — Check if a feature is enabled
- intelligence.policies — List all policies
- intelligence.setPolicy — Set a policy value
- intelligence.removePolicy — Remove a policy
- intelligence.cognitionState — Get current cognition state
- intelligence.overlays — List prompt overlays
- intelligence.createOverlay — Create a prompt overlay
- intelligence.toggleOverlay — Enable/disable an overlay
- intelligence.deleteOverlay — Delete an overlay
- intelligence.buildPromptOverlay — Build combined prompt overlay
- intelligence.trustScore — Get agent trust score
- intelligence.updateTrustScore — Update agent trust score
- intelligence.recalculateTrust — Recalculate trust from factors
- intelligence.chatSessions — List chat sessions

### Memory

- memory.list — List memory entries with optional tier/workspace filters
- memory.get — Get a memory entry by ID
- memory.store — Store a new memory entry
- memory.search — Semantic search across memories
- memory.updateTier — Move memory to a different tier
- memory.updateConfidence — Update memory confidence score

### Flows

- flows.list — List all flows
- flows.get — Get flow by ID
- flows.save — Create or update a flow
- flows.delete — Delete a flow
- flows.startRecording — Begin recording a flow session
- flows.recordEvent — Record an event in an active session

### Playbooks

- playbooks.list — List all playbooks
- playbooks.get — Get playbook by ID
- playbooks.save — Create or update a playbook
- playbooks.delete — Delete a playbook
- playbooks.startRecording — Begin recording a playbook session
- playbooks.recordEvent — Record an event during playbook recording

### Skills

- skills.browse — Browse available skills (with category/search filters)
- skills.installed — List installed skills
- skills.install — Install a skill with permissions
- skills.uninstall — Uninstall a skill
- skills.scan — Scan for available skills

### MCP (Model Context Protocol)

- mcp.serverInfo — Get MCP server information
- mcp.listTools — List all available MCP tools
- mcp.searchTools — Search tools by name/description
- mcp.stats — Get MCP usage statistics
- mcp.callTool — Execute an MCP tool
- mcp.jsonRpc — Send a raw JSON-RPC request
- mcp.listExternalServers — List registered external MCP servers
- mcp.addExternalServer — Register an external MCP server
- mcp.removeExternalServer — Remove an external MCP server
- mcp.refreshDiscovery — Re-discover tools from all servers

### Ephemeris (Astrology Calculations — 66 procedures)

- ephemeris.status — Check if Swiss Ephemeris is available
- ephemeris.natalChart — Calculate full natal chart
- ephemeris.planetaryPositions — Get planetary positions for a date
- ephemeris.currentTransits — Get current planetary transits
- ephemeris.houseCusps — Calculate house cusps
- ephemeris.aspects — Calculate aspects between planets
- ephemeris.moonPhase — Get moon phase for a date
- ephemeris.lunarMansion — Get lunar mansion for a date
- ephemeris.prenatalLunations — Calculate prenatal lunations
- ephemeris.sectAnalysis — Sect analysis (diurnal/nocturnal)
- ephemeris.accidentalDignities — Calculate accidental dignities
- ephemeris.criticalDegrees — Check critical degrees
- ephemeris.lillyScore — Calculate William Lilly score
- ephemeris.dwads — Calculate dwads (2.5-degree subdivisions)
- ephemeris.navamsa — Calculate Vedic navamsa chart
- ephemeris.decanates — Calculate decanates
- ephemeris.ageHarmonic — Calculate age harmonic chart
- ephemeris.harmonicSpectrum — Calculate harmonic spectrum
- ephemeris.antiscia — Calculate antiscia and contra-antiscia
- ephemeris.draconic — Calculate draconic chart
- ephemeris.heliocentric — Calculate heliocentric positions
- ephemeris.arabicParts — Calculate Arabic parts (Lots)
- ephemeris.planetaryHours — Calculate planetary hours
- ephemeris.solarCondition — Analyze solar condition
- ephemeris.fixedStars — Get fixed star positions
- ephemeris.fixedStarAspects — Calculate fixed star aspects
- ephemeris.sabianSymbol — Get Sabian symbol for a degree
- ephemeris.patterns — Detect chart patterns (Grand Trine, T-Square, etc.)
- ephemeris.midpoints — Calculate midpoints
- ephemeris.dispositors — Calculate dispositor tree
- ephemeris.declinations — Calculate planetary declinations
- ephemeris.secondaryProgressions — Calculate secondary progressions
- ephemeris.solarArcDirections — Calculate solar arc directions
- ephemeris.primaryDirections — Calculate primary directions
- ephemeris.solarReturn — Calculate solar return chart
- ephemeris.lunarReturn — Calculate lunar return chart
- ephemeris.nodalReturn — Calculate nodal return chart
- ephemeris.profections — Calculate annual profections
- ephemeris.firdaria — Calculate firdaria periods
- ephemeris.zodiacalReleasing — Calculate zodiacal releasing periods
- ephemeris.decennials — Calculate decennial periods
- ephemeris.trutineOfHermes — Calculate Trutine of Hermes
- ephemeris.animodar — Calculate animodar rectification
- ephemeris.almutenFiguris — Calculate almuten figuris
- ephemeris.huberAgePoint — Calculate Huber age point
- ephemeris.huberTimeline — Generate Huber timeline
- ephemeris.transitCalendar — Generate transit calendar
- ephemeris.panchanga — Calculate Vedic panchanga
- ephemeris.dasha — Calculate Vedic dasha periods
- ephemeris.vargaCharts — Calculate Vedic varga (divisional) charts
- ephemeris.shadbala — Calculate Vedic shadbala strength
- ephemeris.ashtakavarga — Calculate ashtakavarga tables
- ephemeris.charaKarakas — Calculate Jaimini chara karakas
- ephemeris.muhurta — Calculate muhurta (electional) timing
- ephemeris.sevenRays — Calculate esoteric seven rays
- ephemeris.medical — Medical astrology analysis
- ephemeris.financialCycles — Financial astrology cycles
- ephemeris.agricultural — Agricultural astrology timing
- ephemeris.mundane — Mundane astrology analysis
- ephemeris.bradley — Calculate Bradley siderograph
- ephemeris.synastry — Calculate synastry aspects between two charts
- ephemeris.composite — Calculate composite chart
- ephemeris.generateReport — Generate full text report
- ephemeris.horary — Horary chart analysis
- ephemeris.electional — Electional astrology analysis

### Astrology (Chart & Report Management)

- astrology.createChart — Create and store a chart
- astrology.listCharts — List stored charts
- astrology.getChart — Get chart by ID
- astrology.deleteChart — Delete a chart
- astrology.createReport — Generate and store a report
- astrology.listReports — List stored reports
- astrology.getReport — Get report by ID
- astrology.createRelationship — Create a relationship between charts
- astrology.listRelationships — List relationships
- astrology.getRelationship — Get relationship by ID
- astrology.createShareToken — Create a sharing token
- astrology.getSharedResource — Access a shared resource by token
- astrology.revokeShareToken — Revoke a sharing token
- astrology.getLastSeen — Get last seen timestamp
- astrology.updateLastSeen — Update last seen timestamp

### A2A (Agent-to-Agent Protocol)

- a2a.registerCard — Register an agent card
- a2a.card — Get an agent card
- a2a.cards — List all agent cards
- a2a.removeCard — Remove an agent card
- a2a.discover — Discover agents by skill
- a2a.delegate — Delegate a task to another agent
- a2a.accept — Accept a delegated task
- a2a.reject — Reject a delegated task
- a2a.completeDelegation — Mark delegation as complete
- a2a.failDelegation — Mark delegation as failed
- a2a.delegationStatus — Check delegation status
- a2a.pendingDelegations — List pending delegations
- a2a.generateCard — Generate a card for an agent
- a2a.generateAllCards — Generate cards for all agents
- a2a.registerExternal — Register an external agent
- a2a.listExternal — List external agents
- a2a.findExternalBySkill — Find external agent by skill
- a2a.healthCheckAll — Health check all agents
- a2a.deregisterExternal — Deregister an external agent

### Adaptive (Dashboard)

- adaptive.panels — Get dashboard panels
- adaptive.defaultRank — Get default panel ranking
- adaptive.togglePin — Pin/unpin a panel
- adaptive.toggleHidden — Show/hide a panel
- adaptive.resetPreferences — Reset dashboard preferences
- adaptive.timeOfDay — Get time-of-day context

### Admin

- admin.listAllOrgs — List all organizations (platform owner only)
- admin.getOrgById — Get organization by ID
- admin.listOrgMembers — List members of an organization
- admin.listAllUsers — List all users

### AI Templates (Marketplace)

- aitmpl.preInstalled — List pre-installed templates
- aitmpl.browse — Browse available templates
- aitmpl.fetch — Fetch a template by ID
- aitmpl.scan — Scan for new templates
- aitmpl.install — Install a template
- aitmpl.syncCatalog — Sync template catalog

### Alerting

- alerting.getAlertRules — List alert rules
- alerting.createAlertRule — Create an alert rule
- alerting.deleteAlertRule — Delete an alert rule
- alerting.getIncidents — List incidents
- alerting.getActiveIncidents — List active incidents
- alerting.acknowledgeIncident — Acknowledge an incident
- alerting.resolveIncident — Resolve an incident
- alerting.evaluateAlerts — Evaluate all alert rules

### Approvals

- approvals.pending — List pending approvals
- approvals.decide — Approve or reject
- approvals.history — Approval history
- approvals.batchDecide — Batch approve/reject
- approvals.expireStale — Expire stale approvals

### Browser Agent

- browserAgent.activeSessions — List active browser sessions
- browserAgent.session — Get session by ID
- browserAgent.sessionEvents — Get events for a session
- browserAgent.start — Start a browser session
- browserAgent.pause — Pause a session
- browserAgent.resume — Resume a session
- browserAgent.takeover — Take over a session manually
- browserAgent.stop — Stop a session

### Builder

- builder.generateBlueprint — Generate a system blueprint
- builder.inspectDomain — Inspect a domain
- builder.getGapReport — Get gap analysis report
- builder.getRoadmap — Get development roadmap
- builder.getExecutionPlan — Get execution plan
- builder.executeStep — Execute a plan step
- builder.trackProductEvent — Track a product event
- builder.getProductInsights — Get product insights
- builder.getProposals — List proposals
- builder.approveProposal — Approve a proposal
- builder.rejectProposal — Reject a proposal

### Checkpointing

- checkpointing.save — Save a checkpoint
- checkpointing.list — List checkpoints
- checkpointing.get — Get checkpoint by ID
- checkpointing.getLatest — Get latest checkpoint
- checkpointing.count — Count checkpoints
- checkpointing.prune — Prune old checkpoints
- checkpointing.getTimeline — Get checkpoint timeline
- checkpointing.diff — Diff two checkpoints
- checkpointing.diffLatest — Diff against latest
- checkpointing.replay — Replay from checkpoint

### Deployments

- deployments.list — List deployments
- deployments.byId — Get deployment by ID
- deployments.advance — Advance deployment to next stage
- deployments.confirmStep — Confirm a deployment step
- deployments.retry — Retry a failed deployment
- deployments.cancel — Cancel a deployment

### Engine Registry

- engineRegistry.list — List registered engines
- engineRegistry.get — Get engine by ID
- engineRegistry.updateStatus — Update engine status
- engineRegistry.connectApp — Connect an app to an engine
- engineRegistry.registerEngine — Register a new engine
- engineRegistry.listByCategory — List engines by category
- engineRegistry.recordRequest — Record an engine request
- engineRegistry.healthCheck — Health check an engine
- engineRegistry.capabilities — Get engine capabilities

### Entities

- entities.list — List all brain entities
- entities.byTier — List entities by tier
- entities.topology — Get full system topology
- entities.openclawHealth — Check OpenClaw health
- entities.openclawCapabilities — Get OpenClaw capabilities
- entities.byId — Get entity by ID
- entities.update — Update an entity
- entities.delete — Delete an entity

### Evals

- evals.datasets — List eval datasets
- evals.createDataset — Create an eval dataset
- evals.cases — List cases in a dataset
- evals.addCase — Add a case to a dataset
- evals.addCasesBatch — Batch add cases
- evals.runs — List eval runs
- evals.run — Run an eval
- evals.scoreCase — Score a single case
- evals.runDataset — Run eval on entire dataset
- evals.compareRuns — Compare two eval runs
- evals.datasetsWithCounts — List datasets with case counts
- evals.saveFromTrace — Save eval case from a trace
- evals.autoGenerateFromFailures — Auto-generate cases from failures
- evals.autoGenerateFromSuccesses — Auto-generate cases from successes
- evals.detectDrift — Detect drift in a dataset
- evals.detectDriftAll — Detect drift across all datasets
- evals.scoreHistory — Get score history

### Gateway

- gateway.chat — Send a chat completion request
- gateway.embed — Generate embeddings
- gateway.metrics — Get gateway metrics
- gateway.record — Record a gateway event
- gateway.health — Gateway health check
- gateway.agentCost — Get cost for an agent
- gateway.budgetStatus — Check budget status
- gateway.setBudget — Set budget limit
- gateway.setRateLimit — Set rate limit
- gateway.rateLimitStatus — Check rate limit status
- gateway.storeKey — Store an API key
- gateway.rotateKey — Rotate an API key
- gateway.listProviders — List available providers
- gateway.deleteKey — Delete an API key
- gateway.resetCircuit — Reset circuit breaker
- gateway.pricing — Get pricing information
- gateway.costSummary — Get cost summary
- gateway.pruneCache — Prune response cache
- gateway.ollamaModels — List Ollama models
- gateway.addOllamaModel — Add an Ollama model

### Governance

- governance.listUsers — List users with roles
- governance.assignGlobalRole — Assign a global role
- governance.removeGlobalRole — Remove a global role
- governance.getWorkspaceMembers — Get workspace members
- governance.addWorkspaceMember — Add a workspace member
- governance.updateMemberRole — Update member role
- governance.removeMember — Remove a member
- governance.getAuditEvents — Get audit events
- governance.myPermissions — Get current user permissions

### Guardrails

- guardrails.checkInput — Check input against guardrails
- guardrails.checkOutput — Check output against guardrails
- guardrails.checkTool — Check tool call against guardrails
- guardrails.check — Run all guardrail checks
- guardrails.rules — List guardrail rules
- guardrails.logs — Get guardrail logs
- guardrails.stats — Get guardrail statistics

### Healing

- healing.diagnose — Run system diagnostics
- healing.healthCheck — Run health check
- healing.autoHeal — Attempt auto-healing
- healing.restartAgent — Restart an agent
- healing.clearExpiredLeases — Clear expired leases
- healing.requeueTicket — Requeue a stuck ticket
- healing.healingLog — Get healing log

### Instincts

- instincts.list — List all instincts
- instincts.byId — Get instinct by ID
- instincts.observations — Get instinct observations
- instincts.create — Create an instinct
- instincts.updateConfidence — Update instinct confidence
- instincts.delete — Delete an instinct

### Integrations

- integrations.createChannel — Create a notification channel
- integrations.channels — List channels
- integrations.toggleChannel — Enable/disable a channel
- integrations.deleteChannel — Delete a channel
- integrations.createWebhook — Create a webhook
- integrations.webhooks — List webhooks
- integrations.toggleWebhook — Enable/disable a webhook
- integrations.deleteWebhook — Delete a webhook
- integrations.dispatchWebhook — Dispatch a webhook
- integrations.createArtifact — Create an artifact
- integrations.artifact — Get artifact by ID
- integrations.artifactsByTicket — List artifacts for a ticket
- integrations.artifactsByAgent — List artifacts for an agent
- integrations.deleteArtifact — Delete an artifact
- integrations.setFallbackChain — Set model fallback chain
- integrations.fallbackChain — Get a fallback chain
- integrations.allFallbackChains — List all fallback chains
- integrations.resolveNextModel — Resolve next model in chain
- integrations.deleteFallbackChain — Delete a fallback chain

### Journeys

- journeys.list — List all journeys
- journeys.get — Get journey by ID
- journeys.pause — Pause a journey
- journeys.resume — Resume a journey
- journeys.fail — Mark journey as failed

### Factory (Mini-Brain Factory)

- factory.templates — List mini-brain templates
- factory.template — Get template by ID
- factory.developmentTemplates — List development templates
- factory.smartCreate — Smart-create a mini-brain
- factory.regenerateEntityApiKey — Regenerate entity API key
- factory.smartCreateDevelopment — Smart-create for development
- factory.databaseStatus — Check database status
- factory.provisionDatabase — Provision a database
- factory.deprovisionDatabase — Deprovision a database
- factory.reprovisionAgents — Reprovision agents

### Models (Model Registry)

- models.list — List all models
- models.byId — Get model by ID
- models.byType — List models by type
- models.availableModels — List available models
- models.register — Register a new model
- models.update — Update model info
- models.remove — Remove a model
- models.detect — Auto-detect available models
- models.seedKnownModels — Seed known model definitions

### Orchestration

- orchestration.readyTickets — List tickets ready for execution
- orchestration.acquireLock — Acquire a ticket lock
- orchestration.releaseLock — Release a ticket lock
- orchestration.renewLease — Renew a ticket lease
- orchestration.transition — Transition ticket state
- orchestration.assignAgent — Assign agent to ticket
- orchestration.addDependency — Add ticket dependency
- orchestration.completeTicket — Mark ticket complete
- orchestration.failTicket — Mark ticket failed
- orchestration.expiredLeases — List expired leases
- orchestration.cronJobs — List cron jobs
- orchestration.createCronJob — Create a cron job
- orchestration.pauseCronJob — Pause a cron job
- orchestration.resumeCronJob — Resume a cron job
- orchestration.deleteCronJob — Delete a cron job
- orchestration.dueJobs — List due jobs
- orchestration.recordJobSuccess — Record job success
- orchestration.recordJobFailure — Record job failure
- orchestration.formSwarm — Form a swarm of agents
- orchestration.getSwarm — Get swarm details

### Organizations

- organizations.list — List organizations
- organizations.byId — Get organization by ID
- organizations.create — Create an organization
- organizations.update — Update organization
- organizations.getMembers — Get organization members
- organizations.addMember — Add a member
- organizations.updateMemberRole — Update member role
- organizations.removeMember — Remove a member
- organizations.getGlobalRole — Get global role for a user

### Platform

- platform.createDebate — Create a debate session
- platform.submitArgument — Submit a debate argument
- platform.addDebateEdge — Add edge between arguments
- platform.scoreArgument — Score an argument
- platform.scoreDebateSession — Score entire debate
- platform.debateSession — Get debate session
- platform.completeDebate — Complete a debate
- platform.cancelDebate — Cancel a debate
- platform.debateElo — Get debate ELO ratings
- platform.debateLeaderboard — Get debate leaderboard
- platform.recordUsage — Record usage event
- platform.checkBudget — Check budget
- platform.setBudget — Set budget
- platform.usageSummary — Get usage summary
- platform.agentUsage — Get agent usage
- platform.dailyCostTrend — Get daily cost trend
- platform.createEntity — Create a brain entity
- platform.activateEntity — Activate an entity
- platform.suspendEntity — Suspend an entity
- platform.deleteEntity — Delete an entity

### Presence

- presence.getActive — Get active users
- presence.join — Join presence
- presence.leave — Leave presence
- presence.heartbeat — Send heartbeat

### Runtime Status

- runtimeStatus.getRuntimeStatus — Get current runtime status
- runtimeStatus.getRecentIssues — Get recent runtime issues

### Runtimes

- runtimes.getRuntimes — List all runtimes
- runtimes.getRuntime — Get runtime by ID
- runtimes.getRuntimeBindings — Get runtime bindings
- runtimes.registerEndpoint — Register a runtime endpoint
- runtimes.verifyRuntime — Verify a runtime
- runtimes.suspendRuntime — Suspend a runtime
- runtimes.retireRuntime — Retire a runtime
- runtimes.activateRuntime — Activate a runtime
- runtimes.updateDeploymentInfo — Update deployment info

### Secrets

- secrets.list — List secrets (metadata only)
- secrets.byId — Get secret by ID
- secrets.create — Create a secret
- secrets.rotate — Rotate a secret
- secrets.activate — Activate a secret version
- secrets.revoke — Revoke a secret
- secrets.rollback — Rollback to previous version

### System Orchestrator

- systemOrchestrator.status — Get system orchestrator status
- systemOrchestrator.bootstrap — Bootstrap the system
- systemOrchestrator.orchestratorTree — Get orchestrator hierarchy
- systemOrchestrator.linkOrchestrator — Link orchestrators
- systemOrchestrator.childOrchestrators — Get child orchestrators
- systemOrchestrator.escalate — Escalate a task
- systemOrchestrator.delegate — Delegate a task
- systemOrchestrator.routeTask — Route a task to best agent
- systemOrchestrator.workspaceHealth — Get workspace health
- systemOrchestrator.allWorkspacesHealth — Get all workspaces health
- systemOrchestrator.monitorHealth — Monitor system health
- systemOrchestrator.agentAllocation — Get agent allocation
- systemOrchestrator.rebalanceAgents — Rebalance agents across workspaces
- systemOrchestrator.budgetSummary — Get budget summary
- systemOrchestrator.cleanupDuplicates — Clean up duplicate resources
- systemOrchestrator.seedBrain — Seed initial brain data

### Task Runner

- taskRunner.detectMode — Detect execution mode for a ticket
- taskRunner.setMode — Set execution mode
- taskRunner.route — Route ticket to appropriate runner
- taskRunner.executeQuick — Execute in quick mode
- taskRunner.executeAutonomous — Execute in autonomous mode
- taskRunner.startDeepWork — Start deep work session
- taskRunner.executeDeepWork — Execute deep work

### Topology

- topology.getTopology — Get full system topology
- topology.getRuntimeOverlay — Get runtime overlay data
- topology.getBlastRadius — Calculate blast radius for a component
- topology.getInsights — Get topology insights

### Traces

- traces.byTraceId — Get trace by ID
- traces.recent — List recent traces
- traces.byAgent — List traces for an agent
- traces.byTicket — List traces for a ticket
- traces.latencyStats — Get latency statistics

### Visual QA

- visualQa.recordings — List QA recordings
- visualQa.recording — Get recording by ID
- visualQa.startRecording — Start a recording
- visualQa.stopRecording — Stop a recording
- visualQa.review — Review a recording
- visualQa.quickReview — Quick review a recording
