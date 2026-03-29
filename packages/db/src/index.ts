import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from './schema/index'

export * from './schema/index'

/**
 * Run-once schema sync: creates ALL tables and enums if they don't exist.
 * This runs once per cold start and is a no-op if schema is already up to date.
 */
let _schemaSynced = false
async function ensureSchema(pool: pg.Pool): Promise<void> {
  if (_schemaSynced) return
  _schemaSynced = true

  const client = await pool.connect()
  try {
    // ── Step 1: Create all enum types ──
    const enums: [string, string[]][] = [
      ['entity_tier', ['brain', 'mini_brain', 'development']],
      ['entity_status', ['active', 'suspended', 'degraded', 'provisioning']],
      [
        'ticket_status',
        ['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled'],
      ],
      ['ticket_priority', ['low', 'medium', 'high', 'critical']],
      ['ticket_complexity', ['easy', 'medium', 'hard', 'critical']],
      ['execution_mode', ['quick', 'autonomous', 'deep_work']],
      ['agent_status', ['idle', 'planning', 'executing', 'reviewing', 'error', 'offline']],
      ['memory_tier', ['core', 'recall', 'archival']],
      ['approval_status', ['pending', 'approved', 'denied', 'expired']],
      ['guardrail_layer', ['input', 'tool', 'output']],
      ['entity_agent_role', ['primary', 'monitor', 'healer', 'specialist']],
      ['debate_edge_type', ['support', 'attack', 'rebuttal']],
      ['debate_session_status', ['active', 'completed', 'cancelled']],
      ['cron_job_status', ['active', 'paused', 'failed']],
      ['receipt_status', ['running', 'completed', 'failed', 'rolled_back']],
      ['project_status', ['planning', 'active', 'completed', 'cancelled']],
      ['instinct_scope', ['development', 'mini_brain', 'brain']],
      ['workspace_lifecycle', ['draft', 'active', 'paused', 'retired']],
      ['workspace_type', ['general', 'development', 'staging', 'system']],
      [
        'model_type',
        [
          'vision',
          'reasoning',
          'agentic',
          'coder',
          'embedding',
          'flash',
          'guard',
          'judge',
          'router',
          'multimodal',
        ],
      ],
      ['workspace_binding_type', ['brain', 'engine', 'skill']],
      ['workspace_goal_status', ['active', 'achieved', 'abandoned']],
      ['candidate_status', ['pending', 'promoted', 'rejected']],
      ['swarm_status', ['active', 'completed', 'disbanded']],
      ['receipt_action_status', ['completed', 'rolled_back', 'failed']],
      ['anomaly_severity', ['low', 'medium', 'high', 'critical']],
      ['flow_status', ['draft', 'active', 'paused', 'archived']],
      ['chat_run_status', ['running', 'completed', 'failed', 'retried']],
      ['chat_step_type', ['agent', 'tool', 'synthesis']],
      ['chat_step_status', ['running', 'completed', 'failed']],
    ]

    for (const [name, values] of enums) {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v}'`).join(', ')});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `)
    }

    // ── Step 1b: Enable pgvector extension for memory embeddings ──
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch(() => {
      console.warn('[ensureSchema] pgvector extension not available — vector search disabled')
    })

    // ── Step 2: Create all tables (IF NOT EXISTS) ──
    // Order matters: parent tables before children with FK references.

    const tables = [
      // Auth
      `CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text,
        email text UNIQUE NOT NULL,
        email_verified timestamp,
        image text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS accounts (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type text NOT NULL,
        provider text NOT NULL,
        provider_account_id text NOT NULL,
        refresh_token text,
        access_token text,
        expires_at integer,
        token_type text,
        scope text,
        id_token text,
        session_state text,
        PRIMARY KEY (provider, provider_account_id)
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        session_token text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires timestamp NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier text NOT NULL,
        token text NOT NULL,
        expires timestamp NOT NULL,
        PRIMARY KEY (identifier, token)
      )`,

      // Core
      `CREATE TABLE IF NOT EXISTS workspaces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        type workspace_type DEFAULT 'general',
        goal text,
        color text,
        icon text,
        autonomy_level integer DEFAULT 1,
        lifecycle_state workspace_lifecycle NOT NULL DEFAULT 'draft',
        is_system_protected boolean DEFAULT false,
        settings jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS agents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        type text,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT,
        status agent_status NOT NULL DEFAULT 'idle',
        model text,
        color text,
        bg text,
        description text,
        tags text[],
        skills text[],
        is_ws_orchestrator boolean DEFAULT false,
        parent_orchestrator_id uuid,
        required_model_type model_type,
        trigger_mode text,
        soul text,
        temperature real DEFAULT 1.0,
        max_tokens integer DEFAULT 4096,
        tool_access text[],
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS model_registry (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id text NOT NULL UNIQUE,
        display_name text NOT NULL,
        provider text NOT NULL,
        model_type model_type NOT NULL,
        secondary_types text[],
        context_window integer,
        max_output_tokens integer,
        supports_vision boolean DEFAULT false,
        supports_tools boolean DEFAULT false,
        supports_streaming boolean DEFAULT false,
        input_cost_per_m_token real,
        output_cost_per_m_token real,
        speed_tier text,
        is_active boolean NOT NULL DEFAULT true,
        detected_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        goal text,
        status project_status NOT NULL DEFAULT 'planning',
        deadline timestamp,
        health_score real,
        health_diagnosis text,
        synthesis text,
        cancelled boolean DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS project_workspaces (
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        PRIMARY KEY (project_id, workspace_id)
      )`,
      `CREATE TABLE IF NOT EXISTS project_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        workspace_id uuid,
        agent_id uuid,
        updated_at timestamp DEFAULT now(),
        reply text,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text,
        status ticket_status NOT NULL DEFAULT 'backlog',
        priority ticket_priority NOT NULL DEFAULT 'medium',
        complexity ticket_complexity NOT NULL DEFAULT 'medium',
        execution_mode execution_mode DEFAULT 'autonomous',
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        assigned_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        dag_id text,
        dag_node_type text,
        metadata jsonb,
        result text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_execution (
        ticket_id uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
        run_id text,
        lock_owner uuid REFERENCES agents(id) ON DELETE SET NULL,
        locked_at timestamp,
        lease_until timestamp,
        lease_seconds integer,
        wake_pending_count integer DEFAULT 0,
        last_wake_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        from_status ticket_status,
        to_status ticket_status NOT NULL,
        changed_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        text text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_dependencies (
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        blocked_by_ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, blocked_by_ticket_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_proof (
        ticket_id uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
        status text,
        shadow_required boolean DEFAULT false,
        visual_required boolean DEFAULT false,
        shadow_run_id text,
        visual_run_id text,
        checked_at timestamp,
        details jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS workspace_bindings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        binding_type workspace_binding_type NOT NULL,
        binding_key text NOT NULL,
        config jsonb,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS workspace_goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text,
        priority integer NOT NULL DEFAULT 0,
        status workspace_goal_status NOT NULL DEFAULT 'active',
        target_metric text,
        target_value real,
        current_value real,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS workspace_lifecycle_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        from_state workspace_lifecycle,
        to_state workspace_lifecycle,
        payload jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )`,

      // Intelligence
      `CREATE TABLE IF NOT EXISTS memories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL,
        content text NOT NULL,
        source uuid REFERENCES agents(id) ON DELETE SET NULL,
        confidence real NOT NULL DEFAULT 0.5,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        tier memory_tier NOT NULL DEFAULT 'recall',
        access_count integer NOT NULL DEFAULT 0,
        last_accessed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role text NOT NULL,
        text text NOT NULL,
        attachment jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS agent_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        to_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        text text NOT NULL,
        read boolean NOT NULL DEFAULT false,
        ack_status text NOT NULL DEFAULT 'pending',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS episodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL,
        payload jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS cognition_state (
        id text PRIMARY KEY DEFAULT '1',
        features jsonb,
        policies jsonb,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS prompt_overlays (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        content text NOT NULL,
        active boolean DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS agent_trust_scores (
        agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        score real NOT NULL DEFAULT 0.5,
        factors jsonb,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS cognitive_candidates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        status candidate_status DEFAULT 'pending',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,

      // Chat runs + steps (execution tracking)
      `CREATE TABLE IF NOT EXISTS chat_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        user_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
        status chat_run_status DEFAULT 'running' NOT NULL,
        agent_ids text[],
        step_count integer DEFAULT 0,
        retry_of_run_id uuid,
        memory_count integer DEFAULT 0,
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        duration_ms integer
      )`,
      `CREATE TABLE IF NOT EXISTS chat_run_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        type chat_step_type NOT NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        agent_name text,
        tool_name text,
        tool_input jsonb,
        tool_result text,
        status chat_step_status DEFAULT 'running' NOT NULL,
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        duration_ms integer
      )`,

      // Memory vectors (pgvector)
      `CREATE TABLE IF NOT EXISTS memory_vectors (
        memory_id uuid PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
        embedding vector(1536) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,

      // Integrations
      `CREATE TABLE IF NOT EXISTS channels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        config jsonb,
        enabled boolean DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS webhooks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source text,
        url text NOT NULL,
        secret text,
        enabled boolean DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS artifacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        content text,
        ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        type text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS strategy_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        plan text,
        status text DEFAULT 'pending',
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        tickets text[],
        created_at timestamp NOT NULL DEFAULT now(),
        started_at timestamp,
        completed_at timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        encrypted_key text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS model_fallbacks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
        chain text[] NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ollama_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        added_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS orchestrator_routes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_workspace uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        to_workspace uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        orchestrator_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        rule text,
        priority integer DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,

      // Execution
      `CREATE TABLE IF NOT EXISTS cron_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        schedule text NOT NULL,
        type text,
        status cron_job_status NOT NULL DEFAULT 'active',
        task text,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        enabled boolean DEFAULT true,
        fail_count integer DEFAULT 0,
        last_run timestamp,
        next_run timestamp,
        last_result text,
        runs integer DEFAULT 0,
        fails integer DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS ephemeral_swarms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task text NOT NULL,
        status swarm_status DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS swarm_agents (
        swarm_id uuid NOT NULL REFERENCES ephemeral_swarms(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        role text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        PRIMARY KEY (swarm_id, agent_id)
      )`,
      `CREATE TABLE IF NOT EXISTS receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        trigger text,
        status receipt_status NOT NULL DEFAULT 'running',
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        duration_ms integer,
        rollback_available boolean DEFAULT false
      )`,
      `CREATE TABLE IF NOT EXISTS receipt_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        type text NOT NULL,
        target text,
        summary text,
        status receipt_action_status,
        is_rollback_eligible boolean DEFAULT false,
        duration_ms integer,
        pre_state jsonb,
        result jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS receipt_anomalies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        description text NOT NULL,
        severity anomaly_severity,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS approval_gates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action text NOT NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        risk text,
        status approval_status NOT NULL DEFAULT 'pending',
        requested_at timestamp NOT NULL DEFAULT now(),
        decided_at timestamp,
        decided_by text,
        reason text,
        metadata jsonb,
        expires_at timestamp
      )`,

      // Features
      `CREATE TABLE IF NOT EXISTS checkpoints (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        step_index integer NOT NULL,
        state jsonb NOT NULL,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS traces (
        trace_id text NOT NULL,
        parent_span_id text,
        span_id text PRIMARY KEY,
        operation text NOT NULL,
        service text,
        agent_id uuid,
        ticket_id uuid,
        duration_ms integer,
        status text,
        attributes jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS guardrail_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        layer guardrail_layer NOT NULL,
        agent_id uuid,
        ticket_id uuid,
        rule_name text NOT NULL,
        passed boolean NOT NULL,
        violation_detail text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS eval_datasets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS eval_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dataset_id uuid NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
        input jsonb NOT NULL,
        expected_output jsonb,
        trace_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS eval_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dataset_id uuid NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
        version text,
        scores jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS agent_cards (
        agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        capabilities jsonb,
        auth_requirements jsonb,
        endpoint text,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS flows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        steps jsonb NOT NULL,
        status flow_status NOT NULL DEFAULT 'draft',
        created_by text,
        version integer DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS playbooks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        steps jsonb NOT NULL,
        created_by text,
        version integer DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS gateway_metrics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        model text NOT NULL,
        agent_id uuid,
        ticket_id uuid,
        tokens_in integer,
        tokens_out integer,
        latency_ms integer,
        cost_usd real,
        cached boolean DEFAULT false,
        error text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS skills_marketplace (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        source_url text,
        version text,
        installed boolean DEFAULT false,
        config jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS instincts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger text NOT NULL,
        action text NOT NULL,
        confidence real NOT NULL DEFAULT 0.3,
        domain text DEFAULT 'universal',
        scope instinct_scope NOT NULL DEFAULT 'development',
        entity_id uuid,
        evidence_count integer DEFAULT 1,
        last_observed_at timestamp DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS instinct_observations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        instinct_id uuid NOT NULL REFERENCES instincts(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        payload jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS a2a_delegations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        to_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        task text NOT NULL,
        context jsonb,
        status text NOT NULL DEFAULT 'pending',
        result text,
        error text,
        created_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS healing_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action text NOT NULL,
        target text NOT NULL,
        reason text NOT NULL,
        success boolean NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`,

      // Platform
      `CREATE TABLE IF NOT EXISTS brain_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        domain text,
        tier entity_tier NOT NULL,
        parent_id uuid REFERENCES brain_entities(id) ON DELETE SET NULL,
        engines_enabled text[],
        domain_engines jsonb,
        api_key_hash text,
        endpoint text,
        health_endpoint text,
        status entity_status NOT NULL DEFAULT 'provisioning',
        config jsonb,
        hook_profile text DEFAULT 'standard',
        last_health_check timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS brain_entity_agents (
        entity_id uuid NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        role entity_agent_role NOT NULL DEFAULT 'primary',
        created_at timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY (entity_id, agent_id)
      )`,
      `CREATE TABLE IF NOT EXISTS brain_engine_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id uuid NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
        engine text NOT NULL,
        requests_count integer DEFAULT 0,
        tokens_used integer DEFAULT 0,
        cost_usd real DEFAULT 0,
        period timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS debate_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        status debate_session_status NOT NULL DEFAULT 'active',
        constitutional_rules jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS debate_nodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        text text NOT NULL,
        validity real,
        parent_id uuid REFERENCES debate_nodes(id) ON DELETE SET NULL,
        is_axiom boolean DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS debate_edges (
        from_node_id uuid NOT NULL REFERENCES debate_nodes(id) ON DELETE CASCADE,
        to_node_id uuid NOT NULL REFERENCES debate_nodes(id) ON DELETE CASCADE,
        type debate_edge_type NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        PRIMARY KEY (from_node_id, to_node_id)
      )`,
      `CREATE TABLE IF NOT EXISTS debate_elo (
        agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        elo_rating integer NOT NULL DEFAULT 1200,
        matches integer DEFAULT 0,
        wins integer DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS token_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id uuid REFERENCES brain_entities(id) ON DELETE SET NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        model text,
        provider text,
        tokens_in integer DEFAULT 0,
        tokens_out integer DEFAULT 0,
        cost_usd real DEFAULT 0,
        period timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS token_budgets (
        entity_id uuid PRIMARY KEY REFERENCES brain_entities(id) ON DELETE CASCADE,
        daily_limit_usd real,
        monthly_limit_usd real,
        alert_threshold real DEFAULT 0.8,
        enforce boolean DEFAULT true,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
    ]

    for (const sql of tables) {
      await client.query(sql).catch(() => {})
    }

    // ── Step 2b: Add missing columns to existing tables ──
    const alterStatements = [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS soul text`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS temperature real DEFAULT 1.0`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 4096`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS tool_access text[]`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS parent_orchestrator_id uuid`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS required_model_type model_type`,
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_system_protected boolean DEFAULT false`,
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lifecycle_state workspace_lifecycle DEFAULT 'draft' NOT NULL`,
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS icon text`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at timestamp`,
      `ALTER TABLE orchestrator_routes ADD COLUMN IF NOT EXISTS orchestrator_id uuid`,
      `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS source_agent_id uuid`,
      `ALTER TABLE brain_entities ADD COLUMN IF NOT EXISTS database_url text`,
      `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL`,
      `ALTER TABLE chat_run_steps ADD COLUMN IF NOT EXISTS group_id text`,
      `CREATE TABLE IF NOT EXISTS run_memory_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
        memory_id uuid NOT NULL,
        confidence real,
        tier memory_tier,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
      `DO $$ BEGIN CREATE TYPE deployment_workflow_status AS ENUM ('pending','running','completed','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `CREATE TABLE IF NOT EXISTS deployment_workflows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id uuid NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
        dev_entity_id uuid REFERENCES brain_entities(id) ON DELETE SET NULL,
        status deployment_workflow_status NOT NULL DEFAULT 'pending',
        current_step text,
        steps jsonb NOT NULL DEFAULT '[]'::jsonb,
        config jsonb,
        triggered_by uuid REFERENCES users(id),
        error text,
        started_at timestamp,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS deployment_workflows_entity_idx ON deployment_workflows(entity_id)`,
      `CREATE INDEX IF NOT EXISTS deployment_workflows_status_idx ON deployment_workflows(status)`,
    ]
    for (const stmt of alterStatements) {
      await client.query(stmt).catch(() => {})
    }

    // ── Step 3: Seed model_registry with built-in models ──
    const builtInModels = [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        provider: 'anthropic',
        type: 'reasoning',
        ctx: 200000,
        out: 32000,
        vision: true,
        tools: true,
        stream: true,
        inCost: 15.0,
        outCost: 75.0,
        speed: 'slow',
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        type: 'agentic',
        ctx: 200000,
        out: 64000,
        vision: true,
        tools: true,
        stream: true,
        inCost: 3.0,
        outCost: 15.0,
        speed: 'medium',
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
        type: 'flash',
        ctx: 200000,
        out: 8192,
        vision: true,
        tools: true,
        stream: true,
        inCost: 0.8,
        outCost: 4.0,
        speed: 'fast',
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        type: 'reasoning',
        ctx: 128000,
        out: 16384,
        vision: true,
        tools: true,
        stream: true,
        inCost: 2.5,
        outCost: 10.0,
        speed: 'medium',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        type: 'flash',
        ctx: 128000,
        out: 16384,
        vision: true,
        tools: true,
        stream: true,
        inCost: 0.15,
        outCost: 0.6,
        speed: 'fast',
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        provider: 'openai',
        type: 'coder',
        ctx: 1000000,
        out: 32768,
        vision: true,
        tools: true,
        stream: true,
        inCost: 2.0,
        outCost: 8.0,
        speed: 'medium',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        type: 'reasoning',
        ctx: 1000000,
        out: 65536,
        vision: true,
        tools: true,
        stream: true,
        inCost: 1.25,
        outCost: 10.0,
        speed: 'medium',
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        type: 'flash',
        ctx: 1000000,
        out: 65536,
        vision: true,
        tools: true,
        stream: true,
        inCost: 0.15,
        outCost: 0.6,
        speed: 'fast',
      },
    ]

    for (const m of builtInModels) {
      await client
        .query(
          `
        INSERT INTO model_registry (model_id, display_name, provider, model_type, context_window, max_output_tokens, supports_vision, supports_tools, supports_streaming, input_cost_per_m_token, output_cost_per_m_token, speed_tier, is_active)
        VALUES ($1, $2, $3, $4::model_type, $5, $6, $7, $8, $9, $10, $11, $12, true)
        ON CONFLICT (model_id) DO NOTHING
      `,
          [
            m.id,
            m.name,
            m.provider,
            m.type,
            m.ctx,
            m.out,
            m.vision,
            m.tools,
            m.stream,
            m.inCost,
            m.outCost,
            m.speed,
          ],
        )
        .catch(() => {})
    }

    // eslint-disable-next-line no-console
    console.log('[DB] Schema sync complete — all tables ensured + models seeded')
  } catch (err) {
    console.warn('[DB] Schema sync warning:', err instanceof Error ? err.message : err)
  } finally {
    client.release()
  }
}

let _schemaPromise: Promise<void> | null = null

export function createDb(connectionString: string) {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  const pool = new pg.Pool({
    connectionString,
    // Serverless: keep pool tiny to avoid exhausting DB connections
    max: isServerless ? 3 : 20,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // Start schema sync immediately; store promise so callers can await it
  _schemaPromise = ensureSchema(pool).catch(() => {})

  return drizzle(pool, { schema })
}

/** Await this before first DB query to ensure all tables exist */
export function waitForSchema(): Promise<void> {
  return _schemaPromise ?? Promise.resolve()
}

export type Database = ReturnType<typeof createDb>

/**
 * Create a lightweight database connection for a mini-brain's dedicated database.
 * Does NOT run ensureSchema() — the Neon branch inherits schema from the parent.
 */
export function createMiniBrainDb(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })
  return drizzle(pool, { schema })
}
