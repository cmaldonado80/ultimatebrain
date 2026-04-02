/**
 * Tool Executor — defines agent tool schemas and dispatches tool calls
 * to the appropriate engine/service functions.
 */

import type { Database } from '@solarc/db'
import type { ZodiacSign } from '@solarc/ephemeris'
import { synastryAspects } from '@solarc/ephemeris'
import { run as ephemerisRun } from '@solarc/ephemeris'
import { assignHouses, calcAllPlanets, calcHouses, julianDay } from '@solarc/ephemeris'
import { moonPhase } from '@solarc/ephemeris'
import { annualProfections, solarReturn, transitCalendar } from '@solarc/ephemeris'
import { panchanga, vimshottariDasha } from '@solarc/ephemeris'
import { secondaryProgressions } from '@solarc/ephemeris'
import { calcArabicParts } from '@solarc/ephemeris'
import { findAspectPatterns } from '@solarc/ephemeris'
import { firdaria } from '@solarc/ephemeris'
import { calcFixedStars, fixedStarConjunctions } from '@solarc/ephemeris'
import { dispositorChain } from '@solarc/ephemeris'
import { calcAllMidpoints } from '@solarc/ephemeris'
import { lunarReturn } from '@solarc/ephemeris'
import { medicalAstrology } from '@solarc/ephemeris'
import { generateNatalReport } from '@solarc/ephemeris'

import { MemoryService } from '../memory/memory-service'

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

export const AGENT_TOOLS = [
  {
    name: 'ephemeris_natal_chart',
    description:
      'Compute a full natal chart with planets, houses, aspects, dignities, chart shape, Arabic lots. Returns the complete chart data and a summary string.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number', description: 'Birth year (e.g., 1990)' },
        birthMonth: { type: 'number', description: 'Birth month (1-12)' },
        birthDay: { type: 'number', description: 'Birth day (1-31)' },
        birthHour: {
          type: 'number',
          description: 'Birth hour in decimal UTC (e.g., 14.5 = 2:30 PM)',
        },
        latitude: { type: 'number', description: 'Birth latitude in decimal degrees (N positive)' },
        longitude: {
          type: 'number',
          description: 'Birth longitude in decimal degrees (E positive)',
        },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_current_transits',
    description: 'Get current planetary positions (real-time transits for right now).',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'ephemeris_moon_phase',
    description: 'Get the current moon phase, illumination percentage, and waxing/waning status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
      },
      required: ['year', 'month', 'day'],
    },
  },
  {
    name: 'ephemeris_transit_calendar',
    description:
      'Generate a transit calendar showing planetary aspects to a natal chart over a date range.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'startDate',
        'endDate',
      ],
    },
  },
  {
    name: 'ephemeris_panchanga',
    description: 'Calculate Vedic Panchanga (tithi, vara, nakshatra, yoga, karana) for a date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
      },
      required: ['year', 'month', 'day'],
    },
  },
  {
    name: 'ephemeris_dasha',
    description: 'Calculate Vimshottari Dasha (120-year planetary period cycle) from birth data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    },
  },
  {
    name: 'ephemeris_synastry',
    description: 'Calculate synastry aspects between two natal charts for relationship analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person1: {
          type: 'object',
          properties: {
            birthYear: { type: 'number' },
            birthMonth: { type: 'number' },
            birthDay: { type: 'number' },
            birthHour: { type: 'number' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
          required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
        },
        person2: {
          type: 'object',
          properties: {
            birthYear: { type: 'number' },
            birthMonth: { type: 'number' },
            birthDay: { type: 'number' },
            birthHour: { type: 'number' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
          required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
        },
      },
      required: ['person1', 'person2'],
    },
  },
  {
    name: 'ephemeris_solar_return',
    description: 'Compute a Solar Return chart for a specific year.',
    input_schema: {
      type: 'object' as const,
      properties: {
        natalSunLongitude: { type: 'number', description: 'Natal Sun longitude (0-360)' },
        year: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['natalSunLongitude', 'year', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_profections',
    description:
      'Calculate annual profections (profected house, activated sign, lord of the year).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        currentYear: { type: 'number' },
        ascendantSign: { type: 'string', description: 'Ascendant zodiac sign name' },
      },
      required: ['birthYear', 'currentYear', 'ascendantSign'],
    },
  },
  {
    name: 'ephemeris_lunar_return',
    description: 'Compute a Lunar Return chart (Moon returns to natal position).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        targetYear: { type: 'number' },
        targetMonth: { type: 'number' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'targetYear',
        'targetMonth',
      ],
    },
  },
  {
    name: 'ephemeris_progressions',
    description: 'Calculate secondary progressions to a target date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        targetYear: { type: 'number' },
        targetMonth: { type: 'number' },
        targetDay: { type: 'number' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'targetYear',
        'targetMonth',
        'targetDay',
      ],
    },
  },
  {
    name: 'ephemeris_arabic_parts',
    description: 'Calculate 50+ Arabic Parts (Fortune, Spirit, Eros, etc.) from birth data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_patterns',
    description:
      'Find aspect patterns in a natal chart (Grand Trine, T-Square, Yod, Grand Cross, Kite, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_firdaria',
    description: 'Calculate Firdaria time lord periods (planetary years) for birth data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        maxAge: { type: 'number', description: 'Maximum age to calculate (default 75)' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    },
  },
  {
    name: 'ephemeris_fixed_stars',
    description: 'Find fixed star conjunctions to natal planets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_dispositors',
    description: 'Calculate dispositor chains and mutual receptions in a natal chart.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_midpoints',
    description: 'Calculate all planetary midpoints in a natal chart.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_medical',
    description:
      'Medical astrology analysis — body part vulnerabilities by sign and planet placement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_report',
    description:
      'Generate a comprehensive natal report with 15 sections (overview, planets, houses, aspects, patterns, dignities, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        name: { type: 'string', description: 'Name for the report (optional)' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_horary',
    description:
      'Assess a horary chart for a question asked at a specific time. Returns strictures, significators, and judgment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        questionHouse: {
          type: 'number',
          description: 'House ruling the matter (1-12). E.g., 7 for relationships, 10 for career.',
        },
      },
      required: ['year', 'month', 'day', 'hour', 'latitude', 'longitude', 'questionHouse'],
    },
  },
  {
    name: 'ephemeris_electional',
    description:
      'Score a candidate date/time for starting an activity (0-100). Checks Moon condition, planetary hours, aspects, dignities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        activityType: {
          type: 'string',
          description: 'Type: business, relationship, travel, medical, legal, creative, general',
        },
      },
      required: ['year', 'month', 'day', 'hour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'sessions_send',
    description:
      'Send a message to another agent and get their response. Enables agent-to-agent collaboration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        targetAgentId: { type: 'string', description: 'UUID of the agent to message' },
        message: { type: 'string', description: 'Message to send to the target agent' },
      },
      required: ['targetAgentId', 'message'],
    },
  },
  {
    name: 'sessions_spawn',
    description:
      'Spawn a child agent to handle a sub-task independently. Returns the child agent response when complete.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to spawn' },
        task: { type: 'string', description: 'Task description for the child agent' },
      },
      required: ['agentId', 'task'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web using DuckDuckGo. Returns structured results with titles, URLs, and snippets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results (default 5, max 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_scrape',
    description:
      'Fetch a URL and extract readable article content with metadata (title, description, author, date). Uses readability-style extraction to filter out navigation, ads, and boilerplate.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        maxLength: {
          type: 'number',
          description: 'Max content length in chars (default 8000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'db_query',
    description: 'Execute a read-only SQL query on the workspace database. Returns rows as JSON.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL SELECT query (read-only)' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'vision_analyze',
    description: 'Analyze an image using a vision-capable AI model. Describe what you see.',
    input_schema: {
      type: 'object' as const,
      properties: {
        imageUrl: { type: 'string', description: 'URL of image to analyze' },
        question: { type: 'string', description: 'Question about the image (default: describe)' },
      },
      required: ['imageUrl'],
    },
  },
  {
    name: 'weather',
    description: 'Get current weather and forecast for a location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location: { type: 'string', description: 'City name or coordinates' },
      },
      required: ['location'],
    },
  },
  {
    name: 'self_improve',
    description:
      'Log an error, correction, or learning to the instincts system. Helps the agent improve over time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trigger: { type: 'string', description: 'What triggered the error or learning' },
        correction: { type: 'string', description: 'What the correct approach should be' },
        category: {
          type: 'string',
          description: 'Category: code, reasoning, communication, tool-use',
        },
      },
      required: ['trigger', 'correction'],
    },
  },
  {
    name: 'data_analyze',
    description: 'Run a SQL query and get a summarized analysis of the results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL query to analyze' },
        question: { type: 'string', description: 'What insight to extract from results' },
      },
      required: ['sql', 'question'],
    },
  },
  {
    name: 'workflow_create',
    description: 'Create a new automation workflow/flow with defined steps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        description: { type: 'string', description: 'What this workflow does' },
        steps: { type: 'string', description: 'JSON array of step definitions' },
      },
      required: ['name', 'steps'],
    },
  },
  {
    name: 'pipeline_run',
    description: 'Execute a task through the task runner pipeline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Task description to execute' },
        ticketId: { type: 'string', description: 'Optional ticket ID to link to' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'slack_send',
    description: 'Send a message to a Slack channel via webhook.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Message text to send' },
        channel: { type: 'string', description: 'Channel name (optional, uses default)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'notion_query',
    description: 'Query a Notion database or page via the Notion API.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', description: 'Action: search, read, create' },
        query: { type: 'string', description: 'Search query or page ID' },
      },
      required: ['action', 'query'],
    },
  },
  {
    name: 'docker_manage',
    description: 'Manage Docker containers — list, start, stop, or inspect.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', description: 'Action: list, start, stop, inspect, logs' },
        containerId: {
          type: 'string',
          description: 'Container ID or name (required for start/stop/inspect/logs)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'workspace_files',
    description:
      'Manage shared workspace files — list, read, or write files that all agents in the workspace can access.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', description: 'Action: list, read, write' },
        filename: { type: 'string', description: 'File name (required for read/write)' },
        content: { type: 'string', description: 'File content (required for write)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'deep_interview',
    description:
      'Run a Socratic deep interview to clarify requirements before execution. First call with task returns clarifying questions. Second call with answers returns a refined PRD.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task: { type: 'string', description: 'Task or idea to clarify' },
        answers: {
          type: 'string',
          description: 'Answers to previous clarifying questions (for second pass)',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'staged_pipeline',
    description:
      'Execute a task through a staged pipeline: Plan → Execute → Verify → Fix loop. Returns results from each stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task: { type: 'string', description: 'Task to execute through the pipeline' },
        maxFixLoops: { type: 'number', description: 'Max verify→fix iterations (default 2)' },
      },
      required: ['task'],
    },
  },
  {
    name: 'multi_provider_synthesis',
    description:
      'Ask multiple AI providers the same question in parallel, then synthesize the best answer from all responses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Question to ask multiple providers' },
        context: { type: 'string', description: 'Additional context (optional)' },
      },
      required: ['question'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Search stored memories for relevant context. Returns matching memories ranked by relevance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_store',
    description: 'Store a new memory for future recall.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Memory key/title' },
        content: { type: 'string', description: 'Memory content to store' },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'deep_research',
    description:
      'Anthropic-style deep research: breaks a question into sub-queries, runs parallel web searches, scrapes top results, and synthesizes a comprehensive cited answer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Research question to investigate' },
        depth: {
          type: 'string',
          description:
            'Research depth: quick (3 sub-queries), standard (5), thorough (7). Default: standard',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'cite_sources',
    description:
      'Given a text with claims and a list of source URLs, maps each claim to its supporting source. Returns claim-to-source mappings with quotes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text containing claims to cite' },
        sourceUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of source URLs to match claims against',
        },
      },
      required: ['text', 'sourceUrls'],
    },
  },
  {
    name: 'panel_debate',
    description:
      'Multi-perspective analysis: spawns 3 expert agents with different viewpoints on a topic, gets their arguments, then synthesizes a balanced view with consensus and disagreements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Topic to analyze from multiple perspectives' },
        perspectives: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom perspective roles (default: optimist, skeptic, pragmatist)',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'mixture_of_agents',
    description:
      'Ensemble reasoning: sends the same question to 3 different AI models in parallel, then synthesizes their answers into one high-quality response. Use for hard problems — math proofs, algorithm design, complex analysis, or when you need diverse perspectives.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The hard question or problem to solve with ensemble reasoning',
        },
        context: {
          type: 'string',
          description: 'Optional background context to include with the question',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'save_skill',
    description:
      'Save a successful multi-step workflow as a reusable skill for future use. Call this after completing a complex task (5+ tool calls) to capture the procedure so it can be replicated later. Describe the goal, the steps taken, and any key parameters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Short skill name (e.g., "deploy-nextjs-app")' },
        description: { type: 'string', description: 'What this skill does and when to use it' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered list of steps/tool calls that make up this procedure',
        },
        category: {
          type: 'string',
          description: 'Category: development, research, analysis, devops, data, or general',
        },
      },
      required: ['name', 'description', 'steps'],
    },
  },
  {
    name: 'execute_workflow',
    description:
      'Execute a multi-step workflow as a directed acyclic graph (DAG). Supports conditional branching, parallel execution, and state passing between steps. Use for complex tasks that need multiple tools in a specific order with dependencies.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique node ID' },
              type: {
                type: 'string',
                enum: ['tool', 'condition', 'parallel', 'aggregate'],
                description: 'Node type',
              },
              tool: { type: 'string', description: 'Tool name (for type=tool)' },
              input: {
                type: 'object',
                description: 'Tool input. Use {{nodeId}} to reference another node result',
              },
              condition: {
                type: 'string',
                description: 'Condition expression (for type=condition)',
              },
              trueBranch: {
                type: 'array',
                items: { type: 'string' },
                description: 'Node IDs for true branch',
              },
              falseBranch: {
                type: 'array',
                items: { type: 'string' },
                description: 'Node IDs for false branch',
              },
              dependsOn: {
                type: 'array',
                items: { type: 'string' },
                description: 'Node IDs that must complete first',
              },
            },
          },
          description: 'Workflow nodes defining the DAG',
        },
      },
      required: ['name', 'nodes'],
    },
  },

  // ── CEO / Org Management Tools (the corporation's hands) ──────────

  {
    name: 'file_system',
    description:
      'Read, write, or list files on the local filesystem. Use for creating code, configs, documentation, or reading project files. Paths are relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list', 'exists'],
          description: 'File operation',
        },
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'File content (for write action)' },
      },
      required: ['action', 'path'],
    },
  },
  {
    name: 'git_operations',
    description:
      'Execute git operations: status, diff, commit, branch, log, clone. Use for managing code repositories and version control.',
    input_schema: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'branch', 'commit', 'checkout', 'add'],
          description: 'Git operation to perform',
        },
        args: {
          type: 'string',
          description: 'Additional arguments (e.g., branch name, commit message, file path)',
        },
        cwd: { type: 'string', description: 'Working directory (default: project root)' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'create_ticket',
    description:
      'Create a new ticket/task and optionally assign it to an agent. Use when breaking down a project into actionable work items.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Ticket title — what needs to be done' },
        description: { type: 'string', description: 'Detailed description of the task' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Priority level',
        },
        assignedAgentId: { type: 'string', description: 'UUID of agent to assign (optional)' },
        projectId: { type: 'string', description: 'UUID of parent project (optional)' },
        workspaceId: {
          type: 'string',
          description: 'UUID of workspace (optional, defaults to current)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_project',
    description:
      'Create a new project with a goal. Projects contain tickets and track progress toward a strategic objective.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Project name' },
        goal: { type: 'string', description: 'What this project aims to achieve' },
      },
      required: ['name', 'goal'],
    },
  },
  {
    name: 'assign_ticket',
    description:
      'Assign a ticket to a specific agent. The agent will be woken up to work on it. Uses atomic checkout to prevent race conditions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticketId: { type: 'string', description: 'UUID of the ticket to assign' },
        agentId: { type: 'string', description: 'UUID of the agent to assign it to' },
      },
      required: ['ticketId', 'agentId'],
    },
  },
  {
    name: 'create_department',
    description:
      'Create a new department (mini brain) in the corporation. Provisions entity, workspace, and orchestrator agent from a template.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Department name (e.g., "Frontend Engineering")' },
        template: {
          type: 'string',
          enum: ['astrology', 'hospitality', 'healthcare', 'marketing', 'soc-ops'],
          description: 'Template to use (optional — creates empty department if not specified)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'hire_agent',
    description:
      'Hire a new agent into a department. Creates the agent with a role, skills, and soul (system prompt), then assigns to the department.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Agent name (e.g., "Senior Backend Developer")' },
        departmentEntityId: {
          type: 'string',
          description: 'UUID of the department (brainEntity) to hire into',
        },
        role: {
          type: 'string',
          enum: ['primary', 'specialist', 'monitor', 'healer'],
          description: 'Role in the department',
        },
        soul: {
          type: 'string',
          description: 'System prompt defining the agent personality and expertise',
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skill tags (e.g., ["typescript", "react", "api-design"])',
        },
      },
      required: ['name', 'departmentEntityId', 'role'],
    },
  },
  {
    name: 'set_entity_budget',
    description:
      'Set daily and monthly token budget limits for a department or entity. Enforces spending controls across the corporation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entityId: { type: 'string', description: 'UUID of the entity/department' },
        dailyLimitUsd: { type: 'number', description: 'Daily spending limit in USD' },
        monthlyLimitUsd: { type: 'number', description: 'Monthly spending limit in USD' },
      },
      required: ['entityId'],
    },
  },
  {
    name: 'extract_metadata',
    description:
      'Extract structured metadata from a URL: title, description, author, date, Open Graph tags, and JSON-LD structured data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to extract metadata from' },
      },
      required: ['url'],
    },
  },
  {
    name: 'agent_evolve',
    description:
      'Trigger an evolution cycle for an agent: observe performance → analyze failures → synthesize improved soul → gate → apply. Uses real run data to self-improve.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to evolve' },
        windowDays: {
          type: 'number',
          description: 'Days of run history to analyze (default: 7)',
        },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'agent_rollback',
    description:
      'Rollback an agent to a previous soul version. Restores the soul, model, temperature, and tool access from the specified version number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to rollback' },
        version: { type: 'number', description: 'Version number to restore (e.g. 2)' },
      },
      required: ['agentId', 'version'],
    },
  },
  {
    name: 'agent_analyze',
    description:
      "Analyze an agent's recent performance: failure patterns, strengths, weaknesses, quality scores, and learned instincts. Returns an evolution recommendation.",
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to analyze' },
        windowDays: {
          type: 'number',
          description: 'Days of history to analyze (default: 7)',
        },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'agent_evolution_history',
    description:
      'Get the evolution history of an agent: past soul versions, evolution cycles, scores, and mutation summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent' },
        limit: { type: 'number', description: 'Max records to return (default: 10)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'verify_claim',
    description:
      'Verify a completion claim with evidence. Runs a command and checks if the output supports the claim. Use BEFORE claiming work is done — evidence before assertions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        claim: {
          type: 'string',
          description: 'The claim to verify (e.g., "all tests pass", "build succeeds")',
        },
        command: {
          type: 'string',
          description: 'Shell command that produces evidence (e.g., "npm test", "npm run build")',
        },
        successPattern: {
          type: 'string',
          description:
            'Regex pattern that must appear in output for claim to be verified (optional)',
        },
      },
      required: ['claim', 'command'],
    },
  },
  {
    name: 'compact_context',
    description:
      'Compact a conversation by dropping middle messages to fit token limits. Preserves system messages and recent messages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Chat session UUID to compact' },
        maxTokens: { type: 'number', description: 'Max token budget (default: 100000)' },
        preserveRecent: {
          type: 'number',
          description: 'Number of recent messages to keep (default: 10)',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'memory_smart_add',
    description:
      'Intelligently extract facts from a conversation and merge them with existing memories. Uses LLM to: (1) extract atomic facts from messages, (2) compare against existing memories, (3) decide per-fact: ADD new, UPDATE existing, DELETE contradicted, or NONE (already known). Prevents memory bloat and resolves contradictions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' },
            },
          },
          description: 'Conversation messages to extract facts from',
        },
        workspaceId: { type: 'string', description: 'Workspace UUID to scope memories' },
      },
      required: ['messages'],
    },
  },
  {
    name: 'memory_consolidate',
    description:
      'Consolidate raw memory facts into higher-order observations. Scans unconsolidated facts, identifies patterns, and creates/updates observations with proof counts. Observations with higher proof counts are more reliable. Call periodically to promote raw facts into learned knowledge.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID to scope consolidation' },
        limit: {
          type: 'number',
          description: 'Max raw facts to process per batch (default: 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'auto_evolve_all',
    description:
      'Run automatic evolution across all active agents: scans performance, evolves underperformers (score < 0.6), and consolidates memories. Use as a periodic maintenance tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scoreThreshold: {
          type: 'number',
          description: 'Score threshold — evolve agents below this (default: 0.6)',
        },
        maxAgents: {
          type: 'number',
          description: 'Max agents to evolve per run (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'session_summary',
    description:
      'Generate an intelligent session summary: detected topics, key decisions, open questions, and proactive memory suggestions based on conversation analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Chat session UUID to summarize' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'recommend_model',
    description:
      'Recommend the best LLM model for an agent based on historical quality and cost data. Returns quality scores, latency, cost-per-run, and efficiency rankings for each model the agent has used.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to recommend model for' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'agent_capabilities',
    description:
      "Profile an agent's capabilities: strong/weak tools, quality trend, inferred strengths and weaknesses from historical performance data.",
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to profile' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'tool_analytics',
    description:
      'Get tool usage analytics: success/failure rates, average latency, and call counts per tool. Identifies underperforming tools and optimization opportunities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspaceId: { type: 'string', description: 'Filter by workspace (optional)' },
      },
      required: [],
    },
  },
]

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)',
  Accept: 'text/html',
}

/** Search DuckDuckGo Lite and return structured results */
async function ddgSearch(
  query: string,
  max: number,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const res = await fetch(searchUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()

  const linkPattern =
    /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: Array<{ url: string; title: string }> = []
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const href = linkMatch[1] ?? ''
    const title = (linkMatch[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (href && title && !href.includes('duckduckgo.com')) {
      links.push({ url: href, title })
    }
  }

  const snippets: string[] = []
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = snippetPattern.exec(html)) !== null) {
    snippets.push(
      (snippetMatch[1] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }

  const results: Array<{ title: string; url: string; snippet: string }> = []
  for (let i = 0; i < Math.min(links.length, max); i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? '',
    })
  }

  // Fallback: try HTML endpoint if lite returned no results
  if (results.length === 0) {
    const fallbackUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const fbRes = await fetch(fallbackUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const fbHtml = await fbRes.text()

    const resultBlocks = fbHtml.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/gi)
    if (resultBlocks) {
      for (const block of resultBlocks.slice(0, max)) {
        const urlMatch = block.match(/href="([^"]*)"/)
        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
        const snipMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
        if (urlMatch?.[1] && titleMatch?.[1]) {
          results.push({
            title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
            url: urlMatch[1],
            snippet: snipMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
          })
        }
      }
    }
  }

  return results
}

/** Strip HTML boilerplate and extract readable content */
function extractReadableContent(html: string, maxLen: number): string {
  // Remove non-content elements
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Try to find main content container
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  const contentDiv = content.match(
    /<div[^>]*(?:class|id)=["'][^"']*(?:content|article|post|entry|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i,
  )

  if (articleMatch?.[1]) {
    content = articleMatch[1]
  } else if (mainMatch?.[1]) {
    content = mainMatch[1]
  } else if (contentDiv?.[1]) {
    content = contentDiv[1]
  }

  // Convert block elements to newlines, strip remaining tags
  content = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<(?:hr)\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
    .slice(0, maxLen)

  return content
}

/** Scrape a URL and return readable content with metadata */
async function scrapeUrl(
  url: string,
  maxLen: number,
): Promise<{
  url: string
  content: string
  title: string | null
  snippet: string
  metadata?: {
    title: string | null
    description: string | null
    author: string | null
    date: string | null
    image: string | null
  }
}> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })
  const html = await res.text()

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
  const metaAuthor = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([\s\S]*?)["']/i)
  const metaDate =
    html.match(
      /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([\s\S]*?)["']/i,
    ) ??
    html.match(/<meta[^>]*name=["']date["'][^>]*content=["']([\s\S]*?)["']/i) ??
    html.match(/<time[^>]*datetime=["']([\s\S]*?)["']/i)
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i)

  const content = extractReadableContent(html, maxLen)
  const title = titleMatch?.[1]?.trim() ?? null

  return {
    url,
    content,
    title,
    snippet: content.slice(0, 200),
    metadata: {
      title,
      description: metaDesc?.[1]?.trim() ?? null,
      author: metaAuthor?.[1]?.trim() ?? null,
      date: metaDate?.[1]?.trim() ?? null,
      image: ogImage?.[1]?.trim() ?? null,
    },
  }
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

/**
 * Execute a tool call by name, dispatching to the appropriate engine function.
 * Returns the result as a JSON string (or error message).
 */
// ─── Loop Detection State ───────────────────────────────────────────────────

import {
  DEFAULT_LOOP_CONFIG,
  detectToolLoop,
  recordToolCall,
  recordToolOutcome,
  type ToolCallRecord,
} from './loop-detection'
import { auditCommand } from './sandbox-audit'

/** Per-session tool call history for loop detection */
const sessionHistories = new Map<string, ToolCallRecord[]>()

// ─── Tool Analytics ─────────────────────────────────────────────────────────

interface ToolStats {
  successCount: number
  failureCount: number
  totalDurationMs: number
  lastUsed: number
}

/** In-memory tool analytics: Map<"toolName:agentWorkspaceId", ToolStats> */
const toolAnalytics = new Map<string, ToolStats>()

function recordToolAnalytics(
  toolName: string,
  workspaceId: string,
  success: boolean,
  durationMs: number,
): void {
  const key = `${toolName}:${workspaceId}`
  const stats = toolAnalytics.get(key) ?? {
    successCount: 0,
    failureCount: 0,
    totalDurationMs: 0,
    lastUsed: 0,
  }
  if (success) stats.successCount++
  else stats.failureCount++
  stats.totalDurationMs += durationMs
  stats.lastUsed = Date.now()
  toolAnalytics.set(key, stats)
}

/** Get tool analytics for reporting */
export function getToolAnalytics(workspaceId?: string): Array<{
  tool: string
  workspace: string
  successCount: number
  failureCount: number
  successRate: number
  avgDurationMs: number
  totalCalls: number
}> {
  const results: Array<{
    tool: string
    workspace: string
    successCount: number
    failureCount: number
    successRate: number
    avgDurationMs: number
    totalCalls: number
  }> = []

  for (const [key, stats] of toolAnalytics) {
    const [tool, ws] = key.split(':')
    if (workspaceId && ws !== workspaceId) continue
    const total = stats.successCount + stats.failureCount
    results.push({
      tool: tool!,
      workspace: ws!,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      successRate: total > 0 ? stats.successCount / total : 0,
      avgDurationMs: total > 0 ? Math.round(stats.totalDurationMs / total) : 0,
      totalCalls: total,
    })
  }

  return results.sort((a, b) => b.totalCalls - a.totalCalls)
}

/** Get or create a tool call history for a session/workspace */
function getHistory(sessionKey: string): ToolCallRecord[] {
  let history = sessionHistories.get(sessionKey)
  if (!history) {
    history = []
    sessionHistories.set(sessionKey, history)
  }
  return history
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  db?: Database,
  workspaceId?: string,
): Promise<string> {
  try {
    // Loop detection check (before execution)
    const sessionKey = workspaceId ?? 'default'
    const history = getHistory(sessionKey)
    const loopCheck = detectToolLoop(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)

    if (loopCheck.stuck && loopCheck.level === 'critical') {
      recordToolCall(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)
      // DeerFlow-inspired forced stop: instead of returning an error,
      // force the agent to produce a useful final answer with what it has so far.
      return JSON.stringify({
        _forcedStop: true,
        instruction:
          '[FORCED STOP] You have been repeating the same tool calls. ' +
          'Stop calling tools immediately and produce your best final answer ' +
          'based on what you have gathered so far. Summarize your findings, ' +
          'acknowledge what you could not complete, and give the user a useful response.',
        detector: loopCheck.detector,
        count: loopCheck.count,
      })
    }

    // Record the call (even if warning — we still execute but warn)
    recordToolCall(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)

    // Execute the tool with analytics tracking
    const execStart = Date.now()
    const result = await executeToolInner(toolName, toolInput, db, workspaceId)
    const execDuration = Date.now() - execStart

    // Record the outcome for no-progress detection
    recordToolOutcome(history, toolName, toolInput, result)

    // Track tool analytics (success = no error in result)
    const isError = result.includes('"error"') && result.includes('failed')
    recordToolAnalytics(toolName, sessionKey, !isError, execDuration)

    // Prepend warning if loop was detected at warning level
    if (loopCheck.stuck && loopCheck.level === 'warning') {
      try {
        const parsed = JSON.parse(result)
        return JSON.stringify({ ...parsed, _loopWarning: loopCheck.message })
      } catch {
        return result
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}

async function executeToolInner(
  toolName: string,
  toolInput: Record<string, unknown>,
  db?: Database,
  workspaceId?: string,
): Promise<string> {
  try {
    switch (toolName) {
      case 'ephemeris_natal_chart': {
        const result = await ephemerisRun({
          birthYear: toolInput.birthYear as number,
          birthMonth: toolInput.birthMonth as number,
          birthDay: toolInput.birthDay as number,
          birthHour: toolInput.birthHour as number,
          latitude: toolInput.latitude as number,
          longitude: toolInput.longitude as number,
        })
        return JSON.stringify(result)
      }

      case 'ephemeris_current_transits': {
        const now = new Date()
        const jd = julianDay(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
          now.getUTCHours() + now.getUTCMinutes() / 60,
        )
        const planets = calcAllPlanets(jd)
        return JSON.stringify({ jd, date: now.toISOString(), planets })
      }

      case 'ephemeris_moon_phase': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const planets = calcAllPlanets(jd)
        const sunLon = planets.Sun.longitude
        const moonLon = planets.Moon.longitude
        const phase = moonPhase(sunLon, moonLon)
        return JSON.stringify(phase)
      }

      case 'ephemeris_transit_calendar': {
        const input = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          startDate: string
          endDate: string
        }
        const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
        const rawPlanets = calcAllPlanets(jd)
        const houses = calcHouses(jd, input.latitude, input.longitude)
        const natalPlanets = assignHouses(rawPlanets, houses)
        const events = await transitCalendar(natalPlanets, input.startDate, input.endDate)
        return JSON.stringify(events)
      }

      case 'ephemeris_panchanga': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const result = panchanga(jd)
        return JSON.stringify(result)
      }

      case 'ephemeris_dasha': {
        const birthYear = toolInput.birthYear as number
        const birthMonth = toolInput.birthMonth as number
        const birthDay = toolInput.birthDay as number
        const birthHour = toolInput.birthHour as number
        const jd = julianDay(birthYear, birthMonth, birthDay, birthHour)
        const planets = calcAllPlanets(jd)
        const moonLon = planets.Moon.longitude
        const dashas = vimshottariDasha(moonLon, jd)
        return JSON.stringify(dashas)
      }

      case 'ephemeris_synastry': {
        const p1 = toolInput.person1 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const p2 = toolInput.person2 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart1 = (
          await ephemerisRun({
            birthYear: p1.birthYear,
            birthMonth: p1.birthMonth,
            birthDay: p1.birthDay,
            birthHour: p1.birthHour,
            latitude: p1.latitude,
            longitude: p1.longitude,
          })
        ).data
        const chart2 = (
          await ephemerisRun({
            birthYear: p2.birthYear,
            birthMonth: p2.birthMonth,
            birthDay: p2.birthDay,
            birthHour: p2.birthHour,
            latitude: p2.latitude,
            longitude: p2.longitude,
          })
        ).data
        const aspects = synastryAspects(chart1, chart2)
        return JSON.stringify(aspects)
      }

      case 'ephemeris_solar_return': {
        const natalSunLon = toolInput.natalSunLongitude as number
        const year = toolInput.year as number
        const lat = toolInput.latitude as number
        const lon = toolInput.longitude as number
        const result = await solarReturn(natalSunLon, year, lat, lon)
        return JSON.stringify(result)
      }

      case 'ephemeris_profections': {
        const birthYear = toolInput.birthYear as number
        const currentYear = toolInput.currentYear as number
        const ascendantSign = toolInput.ascendantSign as ZodiacSign
        const result = annualProfections(birthYear, currentYear, ascendantSign)
        return JSON.stringify(result)
      }

      case 'memory_search': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const query = toolInput.query as string
        const limit = (toolInput.limit as number) ?? 5
        const results = await memoryService.search(query, {
          limit,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify(results)
      }

      case 'memory_store': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const key = toolInput.key as string
        const content = toolInput.content as string
        const stored = await memoryService.store({
          key,
          content,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify({ id: stored.id, key: stored.key })
      }

      case 'ephemeris_lunar_return': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
        }
        const birthJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const birthPlanets = calcAllPlanets(birthJd)
        const targetJd = julianDay(i.targetYear, i.targetMonth, 1, 12)
        const result = await lunarReturn(
          birthPlanets.Moon.longitude,
          targetJd,
          i.latitude,
          i.longitude,
        )
        return JSON.stringify(result)
      }

      case 'ephemeris_progressions': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
          targetDay: number
        }
        const bJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const tJd = julianDay(i.targetYear, i.targetMonth, i.targetDay, 12)
        const result = await secondaryProgressions(bJd, tJd, i.latitude, i.longitude)
        return JSON.stringify(result)
      }

      case 'ephemeris_arabic_parts': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const parts = calcArabicParts(chart.planets, chart.houses)
        return JSON.stringify(parts)
      }

      case 'ephemeris_patterns': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const patterns = findAspectPatterns(chart.aspects, chart.planets)
        return JSON.stringify(patterns)
      }

      case 'ephemeris_firdaria': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          maxAge?: number
        }
        // Determine day/night chart: hour < 6 or > 18 = night
        const isDiurnal = i.birthHour >= 6 && i.birthHour < 18
        const periods = firdaria(isDiurnal, i.maxAge ?? 75)
        // Anchor age-based periods to actual calendar dates
        const birthDate = new Date(i.birthYear, i.birthMonth - 1, i.birthDay)
        const anchored = periods.map((p) => ({
          ...p,
          startDate: new Date(birthDate.getTime() + p.startAge * 365.25 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          endDate: new Date(birthDate.getTime() + p.endAge * 365.25 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          subPeriods: p.subPeriods.map((sp) => ({
            ...sp,
            startDate: new Date(birthDate.getTime() + sp.startAge * 365.25 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            endDate: new Date(birthDate.getTime() + sp.endAge * 365.25 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
          })),
        }))
        return JSON.stringify(anchored)
      }

      case 'ephemeris_fixed_stars': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const jdStar = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const stars = calcFixedStars(jdStar)
        const conj = fixedStarConjunctions(stars, chart.planets)
        return JSON.stringify(conj)
      }

      case 'ephemeris_dispositors': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = dispositorChain(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_midpoints': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = calcAllMidpoints(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_medical': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = medicalAstrology(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_report': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          name?: string
        }
        const result = await generateNatalReport(i as Parameters<typeof generateNatalReport>[0])
        return JSON.stringify(result)
      }

      case 'ephemeris_horary': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          questionHouse: number
        }
        const { assessHoraryChart } = await import('../engines/swiss-ephemeris/horary')
        const result = await assessHoraryChart(i)
        return JSON.stringify(result)
      }

      case 'ephemeris_electional': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          activityType?: string
        }
        const { scoreElection } = await import('../engines/swiss-ephemeris/electional')
        const result = await scoreElection({
          ...i,
          activityType: (i.activityType ?? 'general') as
            | 'business'
            | 'relationship'
            | 'travel'
            | 'medical'
            | 'legal'
            | 'creative'
            | 'general',
        })
        return JSON.stringify(result)
      }

      case 'sessions_send': {
        if (!db) return JSON.stringify({ error: 'Database required for agent messaging' })
        const targetId = toolInput.targetAgentId as string
        const msg = toolInput.message as string
        const { agents: agentsTable } = await import('@solarc/db')
        const { eq: eqOp } = await import('drizzle-orm')
        const target = await db.query.agents.findFirst({ where: eqOp(agentsTable.id, targetId) })
        if (!target) return JSON.stringify({ error: `Agent ${targetId} not found` })
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)
        const resp = await gw.chat({
          model: target.model ?? undefined,
          messages: [
            ...(target.soul ? [{ role: 'system' as const, content: target.soul }] : []),
            { role: 'user', content: msg },
          ],
          agentId: target.id,
        })
        return JSON.stringify({
          agentId: target.id,
          agentName: target.name,
          response: resp.content,
        })
      }

      case 'sessions_spawn': {
        if (!db) return JSON.stringify({ error: 'Database required for agent spawning' })
        const spawnAgentId = toolInput.agentId as string
        const spawnTask = toolInput.task as string
        const { agents: agentsT } = await import('@solarc/db')
        const { eq: eqFn } = await import('drizzle-orm')
        const spawnAgent = await db.query.agents.findFirst({
          where: eqFn(agentsT.id, spawnAgentId),
        })
        if (!spawnAgent) return JSON.stringify({ error: `Agent ${spawnAgentId} not found` })
        const { GatewayRouter: Gateway } = await import('../gateway')
        const spawnGw = new Gateway(db)
        const spawnResult = await spawnGw.chat({
          model: spawnAgent.model ?? undefined,
          messages: [
            ...(spawnAgent.soul ? [{ role: 'system' as const, content: spawnAgent.soul }] : []),
            { role: 'user', content: spawnTask },
          ],
          agentId: spawnAgent.id,
        })
        return JSON.stringify({
          agentId: spawnAgent.id,
          agentName: spawnAgent.name,
          response: spawnResult.content,
          status: 'completed',
        })
      }

      case 'web_search': {
        const query = toolInput.query as string
        const max = Math.min((toolInput.maxResults as number) ?? 5, 10)
        try {
          const results = await ddgSearch(query, max)
          return JSON.stringify({ query, resultCount: results.length, results })
        } catch (err) {
          return JSON.stringify({
            query,
            results: [],
            error: err instanceof Error ? err.message : 'Search failed',
          })
        }
      }

      case 'web_scrape': {
        const targetUrl = toolInput.url as string
        const maxLen = (toolInput.maxLength as number) ?? 8000
        try {
          const scraped = await scrapeUrl(targetUrl, maxLen)
          return JSON.stringify({
            url: targetUrl,
            metadata: scraped.metadata,
            content: scraped.content,
            contentLength: scraped.content.length,
          })
        } catch (err) {
          return JSON.stringify({
            url: targetUrl,
            error: err instanceof Error ? err.message : 'Scrape failed',
          })
        }
      }

      case 'db_query': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const sql = toolInput.sql as string
        // Sandbox audit for SQL queries
        const sqlAudit = auditCommand(sql)
        if (sqlAudit.verdict === 'block') {
          return JSON.stringify({ error: `Query blocked by sandbox audit: ${sqlAudit.reason}` })
        }
        const sqlNormalized = sql.trim().toLowerCase()
        if (!sqlNormalized.startsWith('select')) {
          return JSON.stringify({ error: 'Only SELECT queries are allowed (read-only)' })
        }
        // Block multiple statements (SQL injection via semicolons)
        const sqlNoStrings = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
        if (sqlNoStrings.includes(';')) {
          return JSON.stringify({ error: 'Multiple statements are not allowed' })
        }
        // Block dangerous keywords outside of string literals
        const dangerousPattern =
          /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|exec|execute)\b/i
        if (dangerousPattern.test(sqlNoStrings)) {
          return JSON.stringify({ error: 'Only read-only SELECT queries are allowed' })
        }
        try {
          const result = await (db as any).execute(sql)
          const rows = result?.rows ?? []
          return JSON.stringify({ rowCount: rows.length, rows: rows.slice(0, 100) })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Query failed' })
        }
      }

      case 'vision_analyze': {
        const imageUrl = toolInput.imageUrl as string
        const question = (toolInput.question as string) ?? 'Describe what you see in this image.'
        try {
          if (!db) return JSON.stringify({ error: 'Database required for gateway' })
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const result = await gw.chat({
            model: 'llama-3.2-11b-vision:cloud',
            messages: [{ role: 'user', content: `${question}\n\nImage URL: ${imageUrl}` }],
          })
          return JSON.stringify({ analysis: result.content })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Vision analysis failed',
          })
        }
      }

      case 'weather': {
        const location = toolInput.location as string
        try {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
            signal: AbortSignal.timeout(10000),
          })
          const data = await res.json()
          return JSON.stringify(data)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Weather fetch failed',
          })
        }
      }

      case 'self_improve': {
        const trigger = toolInput.trigger as string
        const correction = toolInput.correction as string
        const category = (toolInput.category as string) ?? 'general'
        if (db) {
          try {
            const { instinctObservations } = await import('@solarc/db')
            await db.insert(instinctObservations).values({
              eventType: 'self_improve',
              payload: { trigger, correction, category },
            })
          } catch {
            /* best-effort */
          }
        }
        return JSON.stringify({ logged: true, trigger, correction, category })
      }

      case 'data_analyze': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const sqlQ = toolInput.sql as string
        const question = toolInput.question as string
        if (!sqlQ.trim().toLowerCase().startsWith('select')) {
          return JSON.stringify({ error: 'Only SELECT queries allowed' })
        }
        const sqlQNoStrings = sqlQ.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
        if (sqlQNoStrings.includes(';')) {
          return JSON.stringify({ error: 'Multiple statements are not allowed' })
        }
        const dangerousQ =
          /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|exec|execute)\b/i
        if (dangerousQ.test(sqlQNoStrings)) {
          return JSON.stringify({ error: 'Only read-only SELECT queries are allowed' })
        }
        try {
          const result = await (db as any).execute(sqlQ)
          const rows = result?.rows ?? []
          const summary = `Query returned ${rows.length} rows. Sample: ${JSON.stringify(rows.slice(0, 3))}`
          return JSON.stringify({
            question,
            rowCount: rows.length,
            summary,
            sample: rows.slice(0, 10),
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Query failed' })
        }
      }

      case 'workflow_create': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const { flows } = await import('@solarc/db')
        const name = toolInput.name as string
        const desc = (toolInput.description as string) ?? ''
        let steps: unknown[] = []
        try {
          steps = JSON.parse(toolInput.steps as string)
        } catch {
          /* invalid JSON */
        }
        const [flow] = await db
          .insert(flows)
          .values({
            name,
            description: desc,
            steps,
            status: 'draft',
          })
          .returning()
        return JSON.stringify({ flowId: flow?.id, name, stepCount: steps.length })
      }

      case 'pipeline_run': {
        const prompt = toolInput.prompt as string
        const ticketId = toolInput.ticketId as string | undefined
        // Delegate to task runner service
        return JSON.stringify({
          status: 'dispatched',
          prompt,
          ticketId: ticketId ?? null,
          message: 'Task submitted to pipeline runner',
        })
      }

      case 'slack_send': {
        const message = toolInput.message as string
        const webhookUrl = process.env.SLACK_WEBHOOK_URL
        if (!webhookUrl) return JSON.stringify({ error: 'SLACK_WEBHOOK_URL not configured' })
        try {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message }),
          })
          return JSON.stringify({ sent: res.ok, status: res.status })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Slack send failed' })
        }
      }

      case 'notion_query': {
        const action = toolInput.action as string
        const query = toolInput.query as string
        const notionKey = process.env.NOTION_API_KEY
        if (!notionKey) return JSON.stringify({ error: 'NOTION_API_KEY not configured' })
        try {
          if (action === 'search') {
            const res = await fetch('https://api.notion.com/v1/search', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${notionKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query }),
            })
            const data = await res.json()
            return JSON.stringify(data)
          }
          return JSON.stringify({ error: `Unknown action: ${action}. Use: search, read, create` })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Notion query failed',
          })
        }
      }

      case 'docker_manage': {
        const action = toolInput.action as string
        const containerId = toolInput.containerId as string | undefined
        // Docker Socket API calls
        const dockerSocket = process.env.DOCKER_HOST ?? 'http://localhost:2375'
        try {
          if (action === 'list') {
            const res = await fetch(`${dockerSocket}/containers/json?all=true`, {
              signal: AbortSignal.timeout(5000),
            })
            const containers = await res.json()
            return JSON.stringify(
              containers.map((c: any) => ({
                id: c.Id?.slice(0, 12),
                names: c.Names,
                state: c.State,
                status: c.Status,
                image: c.Image,
              })),
            )
          }
          if (!containerId) return JSON.stringify({ error: 'containerId required for this action' })
          if (action === 'start' || action === 'stop') {
            const res = await fetch(`${dockerSocket}/containers/${containerId}/${action}`, {
              method: 'POST',
              signal: AbortSignal.timeout(10000),
            })
            return JSON.stringify({ action, containerId, success: res.ok })
          }
          if (action === 'inspect') {
            const res = await fetch(`${dockerSocket}/containers/${containerId}/json`, {
              signal: AbortSignal.timeout(5000),
            })
            return JSON.stringify(await res.json())
          }
          if (action === 'logs') {
            const res = await fetch(
              `${dockerSocket}/containers/${containerId}/logs?stdout=true&tail=50`,
              { signal: AbortSignal.timeout(5000) },
            )
            return JSON.stringify({ logs: await res.text() })
          }
          return JSON.stringify({ error: `Unknown action: ${action}` })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Docker operation failed',
          })
        }
      }

      case 'workspace_files': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const action = toolInput.action as string
        const filename = toolInput.filename as string | undefined
        const content = toolInput.content as string | undefined
        const { artifacts } = await import('@solarc/db')
        const { eq: eqOp } = await import('drizzle-orm')

        if (action === 'list') {
          const files = await db.query.artifacts.findMany({
            ...(workspaceId ? { where: eqOp(artifacts.agentId, workspaceId) } : {}),
            limit: 50,
          })
          return JSON.stringify(
            files.map((f) => ({ id: f.id, name: f.name, type: f.type, createdAt: f.createdAt })),
          )
        }
        if (action === 'write' && filename && content) {
          const [file] = await db
            .insert(artifacts)
            .values({
              name: filename,
              content,
              type: 'workspace_file',
            })
            .returning()
          return JSON.stringify({ id: file?.id, filename, written: true })
        }
        if (action === 'read' && filename) {
          const file = await db.query.artifacts.findFirst({
            where: eqOp(artifacts.name, filename),
          })
          return JSON.stringify(
            file ? { filename, content: file.content } : { error: 'File not found' },
          )
        }
        return JSON.stringify({ error: 'Invalid action. Use: list, read, write' })
      }

      case 'deep_interview': {
        if (!db) return JSON.stringify({ error: 'Database required for deep interview' })
        const task = toolInput.task as string
        const answers = toolInput.answers as string | undefined
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        if (!answers) {
          // Phase 1: Generate clarifying questions
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a requirements analyst. Given a task description, generate exactly 5 clarifying questions that expose hidden assumptions, ambiguities, and edge cases. Format: numbered list. Be specific and actionable.',
              },
              { role: 'user', content: `Task: ${task}` },
            ],
          })
          return JSON.stringify({
            phase: 'questions',
            task,
            questions: result.content,
            instruction:
              'Answer these questions, then call deep_interview again with the task AND your answers.',
          })
        }

        // Phase 2: Synthesize PRD from task + answers
        const result = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a product requirements writer. Given a task and answered clarifying questions, produce a clear, structured PRD (Product Requirements Document). Include: Goal, Requirements (numbered), Constraints, Acceptance Criteria, Out of Scope.',
            },
            { role: 'user', content: `Task: ${task}\n\nClarifying Answers:\n${answers}` },
          ],
        })
        return JSON.stringify({ phase: 'prd', task, prd: result.content })
      }

      case 'staged_pipeline': {
        if (!db) return JSON.stringify({ error: 'Database required for staged pipeline' })
        const task = toolInput.task as string
        const maxLoops = (toolInput.maxFixLoops as number) ?? 2
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        // Stage 1: Plan
        const planResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a planner. Break this task into clear, numbered steps. Be specific about what each step produces.',
            },
            { role: 'user', content: task },
          ],
        })
        const plan = planResult.content

        // Stage 2: Execute
        const execResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are an executor. Follow this plan step by step. For each step, describe what you would do and the expected output.',
            },
            { role: 'user', content: `Task: ${task}\n\nPlan:\n${plan}` },
          ],
        })
        const execution = execResult.content

        // Stage 3+4: Verify → Fix loop
        let verification = ''
        const fixes: string[] = []
        let currentExecution = execution
        let passed = false

        for (let i = 0; i < maxLoops; i++) {
          const verifyResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a reviewer. Check this execution against the original task. If everything is correct, respond with exactly "PASS". Otherwise, list specific issues that need fixing.',
              },
              { role: 'user', content: `Task: ${task}\n\nExecution:\n${currentExecution}` },
            ],
          })
          verification = verifyResult.content

          if (verification.trim().toUpperCase().startsWith('PASS')) {
            passed = true
            break
          }

          // Fix
          const fixResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a fixer. Address each issue listed in the review. Provide the corrected execution.',
              },
              {
                role: 'user',
                content: `Issues:\n${verification}\n\nOriginal execution:\n${currentExecution}`,
              },
            ],
          })
          fixes.push(fixResult.content)
          currentExecution = fixResult.content
        }

        return JSON.stringify({
          task,
          stages: {
            plan,
            execution,
            verification,
            fixes,
            finalExecution: currentExecution,
          },
          passed,
          loopsUsed: fixes.length,
        })
      }

      case 'multi_provider_synthesis': {
        if (!db) return JSON.stringify({ error: 'Database required for synthesis' })
        const question = toolInput.question as string
        const context = (toolInput.context as string) ?? ''
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        const prompt = context ? `${question}\n\nContext: ${context}` : question

        // Query 3 providers in parallel
        const [responseA, responseB, responseC] = await Promise.all([
          gw
            .chat({
              model: 'deepseek-v3.2:cloud',
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[DeepSeek unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
          gw
            .chat({
              model: 'qwen3.5:cloud',
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[Qwen unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
          gw
            .chat({
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[Default unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
        ])

        // Synthesize
        const synthesisResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a synthesis expert. Given responses from 3 different AI models to the same question, produce the best possible answer by combining insights, resolving contradictions, and highlighting consensus.',
            },
            {
              role: 'user',
              content: `Question: ${question}\n\nModel A (DeepSeek):\n${responseA.content}\n\nModel B (Qwen):\n${responseB.content}\n\nModel C (Default):\n${responseC.content}`,
            },
          ],
        })

        return JSON.stringify({
          question,
          responses: [
            { provider: 'deepseek-v3.2:cloud', content: responseA.content },
            { provider: 'qwen3.5:cloud', content: responseB.content },
            { provider: 'default', content: responseC.content },
          ],
          synthesis: synthesisResult.content,
        })
      }

      case 'deep_research': {
        const question = toolInput.question as string
        const depth = (toolInput.depth as string) ?? 'standard'
        const subQueryCount = depth === 'quick' ? 3 : depth === 'thorough' ? 7 : 5
        const resultsPerQuery = depth === 'quick' ? 2 : depth === 'thorough' ? 5 : 3

        try {
          // Step 1: Generate sub-queries using gateway
          let subQueries: string[] = []
          if (db) {
            const { GatewayRouter: GW } = await import('../gateway')
            const gw = new GW(db)
            const planResult = await gw.chat({
              messages: [
                {
                  role: 'system',
                  content: `You are a research planning expert. Given a research question, generate exactly ${subQueryCount} specific web search queries that together will comprehensively answer the question. Return ONLY a JSON array of strings, no other text.`,
                },
                { role: 'user', content: question },
              ],
            })
            try {
              const parsed = JSON.parse(
                planResult.content.replace(/```json\n?/g, '').replace(/```\n?/g, ''),
              )
              subQueries = Array.isArray(parsed) ? parsed.slice(0, subQueryCount) : []
            } catch {
              subQueries = [question, `${question} latest research`, `${question} expert analysis`]
            }
          } else {
            subQueries = [question, `${question} research`, `${question} analysis`].slice(
              0,
              subQueryCount,
            )
          }

          // Step 2: Parallel web searches using shared helper
          const searchResults = await Promise.all(
            subQueries.map(async (q) => {
              try {
                const results = await ddgSearch(q, resultsPerQuery)
                return results.map((r) => ({ ...r, query: q }))
              } catch {
                return []
              }
            }),
          )
          const allResults = searchResults.flat()

          // Step 3: Deduplicate by URL and scrape top results using shared helper
          const seen = new Set<string>()
          const uniqueResults = allResults.filter((r) => {
            if (seen.has(r.url)) return false
            seen.add(r.url)
            return true
          })

          const maxScrape = depth === 'quick' ? 6 : depth === 'thorough' ? 15 : 10
          const sources = await Promise.all(
            uniqueResults.slice(0, maxScrape).map(async (r) => {
              try {
                const scraped = await scrapeUrl(r.url, 2000)
                return {
                  url: r.url,
                  title: scraped.title ?? r.title,
                  snippet: r.snippet,
                  content: scraped.content,
                }
              } catch {
                return { url: r.url, title: r.title, snippet: r.snippet, content: '' }
              }
            }),
          )

          // Step 4: Synthesize with citations
          let synthesis = ''
          const citations: Array<{ claim: string; sourceUrl: string }> = []

          if (db) {
            const { GatewayRouter: GW2 } = await import('../gateway')
            const gw2 = new GW2(db)

            const sourceSummaries = sources
              .filter((s) => s.content.length > 50)
              .map((s, i) => `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
              .join('\n\n---\n\n')

            const synthResult = await gw2.chat({
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a research synthesis expert. Given a question and multiple source extracts, produce a comprehensive, well-structured answer. Cite sources using [Source N] notation. Be factual, thorough, and highlight areas of agreement/disagreement between sources.',
                },
                {
                  role: 'user',
                  content: `Research Question: ${question}\n\nSources:\n${sourceSummaries}`,
                },
              ],
            })
            synthesis = synthResult.content

            // Extract citation references from synthesis
            const citeMatches = synthesis.matchAll(/\[Source (\d+)\]/g)
            for (const cm of citeMatches) {
              const idx = parseInt(cm[1]!, 10) - 1
              if (sources[idx]) {
                citations.push({
                  claim:
                    cm.input
                      ?.slice(Math.max(0, (cm.index ?? 0) - 80), (cm.index ?? 0) + 80)
                      ?.trim() ?? '',
                  sourceUrl: sources[idx]!.url,
                })
              }
            }
          } else {
            synthesis =
              'Synthesis requires database access for LLM gateway. Raw sources are provided below.'
          }

          return JSON.stringify({
            question,
            depth,
            plan: subQueries,
            sourceCount: sources.length,
            sources: sources.map((s) => ({
              url: s.url,
              title: s.title,
              snippet: s.snippet,
              contentPreview: s.content.slice(0, 200),
            })),
            synthesis,
            citations: [...new Map(citations.map((c) => [c.sourceUrl, c])).values()],
          })
        } catch (err) {
          return JSON.stringify({
            question,
            error: err instanceof Error ? err.message : 'Deep research failed',
          })
        }
      }

      case 'cite_sources': {
        const text = toolInput.text as string
        const sourceUrls = toolInput.sourceUrls as string[]
        try {
          // Scrape each source using shared helper
          const scrapedSources = await Promise.all(
            sourceUrls.slice(0, 10).map(async (srcUrl) => {
              try {
                const scraped = await scrapeUrl(srcUrl, 3000)
                return { url: srcUrl, content: scraped.content }
              } catch {
                return { url: srcUrl, content: '' }
              }
            }),
          )

          if (!db) {
            return JSON.stringify({
              error: 'Citation mapping requires database access for LLM gateway',
              sources: scrapedSources.map((s) => ({ url: s.url, available: s.content.length > 0 })),
            })
          }

          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)

          const sourceBlock = scrapedSources
            .filter((s) => s.content.length > 0)
            .map((s) => `[${s.url}]\n${s.content}`)
            .join('\n\n---\n\n')

          const citeResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You map claims to sources. Given a text and sources, identify each factual claim in the text and match it to the source URL that supports it. Return ONLY a JSON array: [{"claim": "...", "sourceUrl": "...", "quote": "relevant quote from source"}]. If a claim has no matching source, omit it.',
              },
              {
                role: 'user',
                content: `Text to cite:\n${text}\n\nSources:\n${sourceBlock}`,
              },
            ],
          })

          try {
            const citations = JSON.parse(
              citeResult.content.replace(/```json\n?/g, '').replace(/```\n?/g, ''),
            )
            return JSON.stringify({ citations, sourceCount: scrapedSources.length })
          } catch {
            return JSON.stringify({
              rawResponse: citeResult.content,
              sourceCount: scrapedSources.length,
            })
          }
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Citation failed',
          })
        }
      }

      case 'mixture_of_agents': {
        // Hermes-inspired MoA: send same question to 3 models, aggregate best answer
        const moaQuestion = toolInput.question as string
        const moaContext = (toolInput.context as string) ?? ''
        if (!db)
          return JSON.stringify({ error: 'Mixture of Agents requires database for LLM gateway' })

        try {
          const { GatewayRouter: MoaGW } = await import('../gateway')
          const moaGw = new MoaGW(db)

          // Layer 1: 3 reference models answer in parallel
          const referenceModels = [
            {
              name: 'analyst',
              prompt:
                'You are a rigorous analytical thinker. Break the problem into components and reason step-by-step. Be precise and cite your reasoning.',
            },
            {
              name: 'creative',
              prompt:
                'You are a creative problem solver. Think laterally, consider unconventional approaches, and look for insights others might miss.',
            },
            {
              name: 'critic',
              prompt:
                'You are a critical evaluator. Identify edge cases, potential errors, and challenge assumptions. Point out what could go wrong.',
            },
          ]

          const referenceResults = await Promise.allSettled(
            referenceModels.map(async (model) => {
              const result = await moaGw.chat({
                messages: [
                  { role: 'system', content: model.prompt },
                  {
                    role: 'user',
                    content: moaContext
                      ? `Context: ${moaContext}\n\nQuestion: ${moaQuestion}`
                      : moaQuestion,
                  },
                ],
                temperature: 0.6,
                maxTokens: 2048,
              })
              return { name: model.name, response: result.content }
            }),
          )

          const successful = referenceResults
            .filter(
              (r): r is PromiseFulfilledResult<{ name: string; response: string }> =>
                r.status === 'fulfilled',
            )
            .map((r) => r.value)

          if (successful.length === 0) {
            return JSON.stringify({ error: 'All reference models failed' })
          }

          // Layer 1.5: Peer review — agents score each other before aggregation
          let approvedPerspectives = successful
          if (successful.length >= 2) {
            try {
              const { runPeerReview } = await import('../intelligence/peer-review')
              const peerResult = await runPeerReview(
                moaQuestion,
                successful.map((s) => ({ name: s.name, content: s.response })),
                moaGw,
              )
              approvedPerspectives = peerResult.approved.map((a) => ({
                name: a.name,
                response: a.content,
              }))
            } catch {
              // Peer review failed — use all perspectives (graceful degradation)
            }
          }

          // Layer 2: Aggregator synthesizes the best answer (only approved perspectives)
          const referencesText = approvedPerspectives
            .map((r) => `### ${r.name.toUpperCase()} PERSPECTIVE\n${r.response}`)
            .join('\n\n')

          const aggregated = await moaGw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert synthesizer. You have received responses from multiple AI perspectives on the same question. Critically evaluate each response, identify the strongest reasoning, resolve conflicts, and produce a single authoritative answer that combines the best insights. Be specific and thorough.',
              },
              { role: 'user', content: `Question: ${moaQuestion}\n\n${referencesText}` },
            ],
            temperature: 0.4,
            maxTokens: 4096,
          })

          return JSON.stringify({
            answer: aggregated.content,
            modelsUsed: successful.length,
            perspectives: successful.map((r) => r.name),
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'MoA failed' })
        }
      }

      case 'save_skill': {
        // Hermes-inspired procedural skill capture — save multi-step workflows as reusable skills
        const skillName = toolInput.name as string
        const skillDescription = toolInput.description as string
        const skillSteps = toolInput.steps as string[]
        const skillCategory = (toolInput.category as string) ?? 'general'

        if (!db) return JSON.stringify({ error: 'Database required for skill storage' })

        try {
          const { memories: memoriesTable } = await import('@solarc/db')

          // Store skill as a core-tier memory with structured content
          const skillContent = [
            `## Skill: ${skillName}`,
            `**Category:** ${skillCategory}`,
            `**Description:** ${skillDescription}`,
            '',
            '### Steps',
            ...skillSteps.map((step, i) => `${i + 1}. ${step}`),
          ].join('\n')

          const [saved] = await db
            .insert(memoriesTable)
            .values({
              key: `skill:${skillName}`,
              content: skillContent,
              tier: 'core',
              factType: 'observation',
              confidence: 0.9,
              proofCount: 1,
              ...(workspaceId ? { workspaceId } : {}),
            })
            .returning({ id: memoriesTable.id })

          return JSON.stringify({
            saved: true,
            skillName,
            skillId: saved?.id,
            category: skillCategory,
            stepCount: skillSteps.length,
            message: `Skill "${skillName}" saved. It will be recalled when similar tasks arise.`,
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Skill save failed' })
        }
      }

      case 'execute_workflow': {
        // DAG Engine — execute multi-step workflows with branching and parallelism
        const wfName = toolInput.name as string
        const wfNodes = toolInput.nodes as Array<{
          id: string
          type: string
          tool?: string
          input?: Record<string, unknown>
          condition?: string
          trueBranch?: string[]
          falseBranch?: string[]
          dependsOn?: string[]
        }>

        if (!db) return JSON.stringify({ error: 'Database required for workflow execution' })

        try {
          const { executeDAG } = await import('../orchestration/dag-engine')

          const workflow = {
            id: crypto.randomUUID(),
            name: wfName,
            nodes: wfNodes.map((n) => ({
              id: n.id,
              type: n.type as 'tool' | 'condition' | 'parallel' | 'aggregate',
              tool: n.tool,
              input: n.input,
              condition: n.condition,
              trueBranch: n.trueBranch,
              falseBranch: n.falseBranch,
              dependsOn: n.dependsOn ?? [],
              status: 'pending' as const,
            })),
            state: {} as Record<string, unknown>,
            status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
          }

          const result = await executeDAG(workflow, async (toolName, input) => {
            return executeToolInner(toolName, input, db, workspaceId)
          })

          return JSON.stringify({
            workflowId: result.workflowId,
            status: result.status,
            totalDurationMs: result.totalDurationMs,
            nodesExecuted: result.nodeResults.length,
            nodeResults: result.nodeResults.map((n) => ({
              id: n.id,
              status: n.status,
              durationMs: n.durationMs,
            })),
            finalState: Object.fromEntries(
              Object.entries(result.state).slice(0, 20), // Cap state output
            ),
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Workflow execution failed',
          })
        }
      }

      // ── CEO / Org Management Tool Executors ──────────────────────────

      case 'file_system': {
        const fsAction = toolInput.action as string
        const fsPath = toolInput.path as string
        const fsContent = toolInput.content as string | undefined

        // Security: block path traversal
        if (fsPath.includes('..') || fsPath.startsWith('/')) {
          return JSON.stringify({ error: 'Path traversal not allowed. Use relative paths only.' })
        }

        const { auditCommand: auditFs } = await import('./sandbox-audit')
        const fsAudit = auditFs(`file ${fsAction} ${fsPath}`)
        if (fsAudit.verdict === 'block') {
          return JSON.stringify({ error: `Blocked: ${fsAudit.reason}` })
        }

        const path = await import('path')
        const fs = await import('fs/promises')
        const fullPath = path.resolve(process.cwd(), fsPath)

        try {
          switch (fsAction) {
            case 'read': {
              const data = await fs.readFile(fullPath, 'utf-8')
              return JSON.stringify({
                path: fsPath,
                content: data.slice(0, 50000),
                truncated: data.length > 50000,
              })
            }
            case 'write': {
              if (!fsContent) return JSON.stringify({ error: 'Content required for write' })
              await fs.mkdir(path.dirname(fullPath), { recursive: true })
              await fs.writeFile(fullPath, fsContent, 'utf-8')
              return JSON.stringify({ path: fsPath, written: true, bytes: fsContent.length })
            }
            case 'list': {
              const entries = await fs.readdir(fullPath, { withFileTypes: true })
              return JSON.stringify(
                entries.slice(0, 100).map((e) => ({
                  name: e.name,
                  type: e.isDirectory() ? 'directory' : 'file',
                })),
              )
            }
            case 'exists': {
              try {
                await fs.access(fullPath)
                return JSON.stringify({ exists: true, path: fsPath })
              } catch {
                return JSON.stringify({ exists: false, path: fsPath })
              }
            }
            default:
              return JSON.stringify({ error: 'Invalid action. Use: read, write, list, exists' })
          }
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'File operation failed',
          })
        }
      }

      case 'git_operations': {
        const gitOp = toolInput.operation as string
        const gitArgs = (toolInput.args as string) ?? ''
        const gitCwd = (toolInput.cwd as string) ?? process.cwd()

        // Security: audit the git command
        const { auditCommand: auditGit } = await import('./sandbox-audit')
        const gitAudit = auditGit(`git ${gitOp} ${gitArgs}`)
        if (gitAudit.verdict === 'block') {
          return JSON.stringify({ error: `Blocked: ${gitAudit.reason}` })
        }

        // Only allow safe git operations
        const safeOps = ['status', 'diff', 'log', 'branch', 'commit', 'checkout', 'add']
        if (!safeOps.includes(gitOp)) {
          return JSON.stringify({
            error: `Unsupported git operation: ${gitOp}. Allowed: ${safeOps.join(', ')}`,
          })
        }

        try {
          const { execSync: gitExec } = await import('child_process')
          const cmd = gitArgs ? `git ${gitOp} ${gitArgs}` : `git ${gitOp}`
          const output = gitExec(cmd, {
            encoding: 'utf8',
            timeout: 30000,
            cwd: gitCwd,
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim()
          return JSON.stringify({ operation: gitOp, output: output.slice(0, 10000) })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Git operation failed',
          })
        }
      }

      case 'create_ticket': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const ticketTitle = toolInput.title as string
        const ticketDesc = (toolInput.description as string) ?? null
        const ticketPriority = (toolInput.priority as string) ?? 'medium'
        const ticketAgent = (toolInput.assignedAgentId as string) ?? null
        const ticketProject = (toolInput.projectId as string) ?? null
        const ticketWs = (toolInput.workspaceId as string) ?? workspaceId ?? null

        try {
          const { tickets: ticketsT } = await import('@solarc/db')
          const [created] = await db
            .insert(ticketsT)
            .values({
              title: ticketTitle,
              description: ticketDesc,
              priority: ticketPriority as 'low' | 'medium' | 'high' | 'critical',
              assignedAgentId: ticketAgent,
              projectId: ticketProject,
              workspaceId: ticketWs,
            })
            .returning({ id: ticketsT.id })
          return JSON.stringify({
            ticketId: created?.id,
            title: ticketTitle,
            assigned: ticketAgent,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Ticket creation failed',
          })
        }
      }

      case 'create_project': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const projName = toolInput.name as string
        const projGoal = toolInput.goal as string

        try {
          const { projects: projectsT } = await import('@solarc/db')
          const [created] = await db
            .insert(projectsT)
            .values({ name: projName, goal: projGoal })
            .returning({ id: projectsT.id })
          return JSON.stringify({ projectId: created?.id, name: projName, goal: projGoal })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Project creation failed',
          })
        }
      }

      case 'assign_ticket': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const assignTicketId = toolInput.ticketId as string
        const assignAgentId = toolInput.agentId as string

        try {
          const { atomicCheckout } = await import('../platform/atomic-checkout')
          const result = await atomicCheckout(db, assignTicketId, assignAgentId, null)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Assignment failed' })
        }
      }

      case 'create_department': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const deptName = toolInput.name as string
        const deptTemplate = toolInput.template as string | undefined

        try {
          if (deptTemplate) {
            // Use factory smart create for templated departments
            const { brainEntities: beT } = await import('@solarc/db')
            const factory = await import('../mini-brain-factory/factory')
            const f = new factory.MiniBrainFactory()
            const tpl = f.getTemplate(deptTemplate as 'astrology')
            if (!tpl) return JSON.stringify({ error: `Template ${deptTemplate} not found` })

            // Create entity directly
            const [entity] = await db
              .insert(beT)
              .values({
                name: deptName,
                tier: 'mini_brain',
                domain: deptTemplate,
                status: 'active',
              })
              .returning({ id: beT.id })
            return JSON.stringify({
              departmentId: entity?.id,
              name: deptName,
              template: deptTemplate,
            })
          }

          // No template — create empty department
          const { brainEntities: beT2 } = await import('@solarc/db')
          const [entity] = await db
            .insert(beT2)
            .values({ name: deptName, tier: 'mini_brain', status: 'active' })
            .returning({ id: beT2.id })
          return JSON.stringify({ departmentId: entity?.id, name: deptName })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Department creation failed',
          })
        }
      }

      case 'hire_agent': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const hireName = toolInput.name as string
        const hireDeptId = toolInput.departmentEntityId as string
        const hireRole = (toolInput.role as string) ?? 'specialist'
        const hireSoul = (toolInput.soul as string) ?? `You are ${hireName}, a specialist agent.`
        const hireSkills = (toolInput.skills as string[]) ?? []

        try {
          const { onboardAgent } = await import('../orchestration/agent-lifecycle')
          // Find workspace for this department
          const { brainEntities: beT3 } = await import('@solarc/db')
          const { eq: eqHire } = await import('drizzle-orm')
          const dept = await db.query.brainEntities.findFirst({
            where: eqHire(beT3.id, hireDeptId),
          })
          const deptConfig = (dept?.config ?? {}) as Record<string, unknown>
          const wsId =
            typeof deptConfig.workspaceId === 'string' ? deptConfig.workspaceId : workspaceId

          if (!wsId) return JSON.stringify({ error: 'No workspace found for department' })

          const result = await onboardAgent(db, {
            name: hireName,
            departmentEntityId: hireDeptId,
            role: hireRole as 'primary' | 'specialist' | 'monitor' | 'healer',
            workspaceId: wsId,
            soul: hireSoul,
            skills: hireSkills,
          })
          return JSON.stringify({
            ...result,
            name: hireName,
            department: hireDeptId,
            role: hireRole,
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Hiring failed' })
        }
      }

      case 'set_entity_budget': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const budgetEntityId = toolInput.entityId as string
        const budgetDaily = toolInput.dailyLimitUsd as number | undefined
        const budgetMonthly = toolInput.monthlyLimitUsd as number | undefined

        try {
          const { TokenLedgerService } = await import('../platform')
          const ledger = new TokenLedgerService(db)
          await ledger.setBudget(budgetEntityId, {
            dailyLimitUsd: budgetDaily,
            monthlyLimitUsd: budgetMonthly,
          })
          return JSON.stringify({
            entityId: budgetEntityId,
            dailyLimitUsd: budgetDaily,
            monthlyLimitUsd: budgetMonthly,
            set: true,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Budget setting failed',
          })
        }
      }

      case 'panel_debate': {
        const topic = toolInput.topic as string
        const perspectives = (toolInput.perspectives as string[]) ?? [
          'optimist',
          'skeptic',
          'pragmatist',
        ]

        if (!db) {
          return JSON.stringify({ error: 'Panel debate requires database access for LLM gateway' })
        }

        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)

          // Spawn parallel "expert" calls
          const perspectiveResults = await Promise.all(
            perspectives.slice(0, 5).map(async (role) => {
              const result = await gw
                .chat({
                  messages: [
                    {
                      role: 'system',
                      content: `You are a ${role} expert analyst. Analyze the given topic from a ${role}'s perspective. Be specific, use evidence-based reasoning, and make a compelling case for your viewpoint. Keep your response under 300 words.`,
                    },
                    {
                      role: 'user',
                      content: `Analyze this topic: ${topic}`,
                    },
                  ],
                })
                .catch((err) => ({
                  content: `[${role} perspective unavailable: ${err instanceof Error ? err.message : 'error'}]`,
                  tokensIn: 0,
                  tokensOut: 0,
                }))
              return { role, argument: result.content }
            }),
          )

          // Synthesis call
          const debateText = perspectiveResults
            .map((p) => `### ${p.role.toUpperCase()}\n${p.argument}`)
            .join('\n\n')

          const synthesisResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a balanced moderator. Given multiple expert perspectives on a topic, synthesize a balanced analysis. Identify: 1) Points of consensus, 2) Key disagreements, 3) Your balanced conclusion. Return as JSON: {"synthesis": "...", "consensus": ["..."], "disagreements": ["..."]}',
              },
              {
                role: 'user',
                content: `Topic: ${topic}\n\n${debateText}`,
              },
            ],
          })

          let synthesis = synthesisResult.content
          let consensus: string[] = []
          let disagreements: string[] = []

          try {
            const parsed = JSON.parse(synthesis.replace(/```json\n?/g, '').replace(/```\n?/g, ''))
            synthesis = parsed.synthesis ?? synthesis
            consensus = parsed.consensus ?? []
            disagreements = parsed.disagreements ?? []
          } catch {
            // Use raw synthesis if JSON parsing fails
          }

          return JSON.stringify({
            topic,
            perspectives: perspectiveResults,
            synthesis,
            consensus,
            disagreements,
          })
        } catch (err) {
          return JSON.stringify({
            topic,
            error: err instanceof Error ? err.message : 'Panel debate failed',
          })
        }
      }

      case 'extract_metadata': {
        const metaUrl = toolInput.url as string
        try {
          const res = await fetch(metaUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)' },
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
          })
          const html = await res.text()

          // Standard meta tags
          const getMetaContent = (nameOrProp: string): string | null => {
            const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const byName = html.match(
              new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*?)["']`, 'i'),
            )
            const byProp = html.match(
              new RegExp(
                `<meta[^>]*property=["']${escaped}["'][^>]*content=["']([^"']*?)["']`,
                'i',
              ),
            )
            // Also match content before name/property attribute
            const byNameRev = html.match(
              new RegExp(`<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']${escaped}["']`, 'i'),
            )
            const byPropRev = html.match(
              new RegExp(
                `<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']${escaped}["']`,
                'i',
              ),
            )
            return byName?.[1] ?? byProp?.[1] ?? byNameRev?.[1] ?? byPropRev?.[1] ?? null
          }

          const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null
          const canonical =
            html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*?)["']/i)?.[1] ?? null

          // Open Graph
          const og = {
            title: getMetaContent('og:title'),
            description: getMetaContent('og:description'),
            image: getMetaContent('og:image'),
            type: getMetaContent('og:type'),
            siteName: getMetaContent('og:site_name'),
            url: getMetaContent('og:url'),
          }

          // Twitter Card
          const twitter = {
            card: getMetaContent('twitter:card'),
            title: getMetaContent('twitter:title'),
            description: getMetaContent('twitter:description'),
            image: getMetaContent('twitter:image'),
            creator: getMetaContent('twitter:creator'),
          }

          // JSON-LD structured data
          const jsonLdMatches = html.matchAll(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
          )
          const jsonLd: unknown[] = []
          for (const jm of jsonLdMatches) {
            try {
              jsonLd.push(JSON.parse(jm[1]!))
            } catch {
              // Skip invalid JSON-LD
            }
          }

          return JSON.stringify({
            url: metaUrl,
            title,
            description: getMetaContent('description'),
            author: getMetaContent('author'),
            date:
              getMetaContent('article:published_time') ??
              getMetaContent('date') ??
              html.match(/<time[^>]*datetime=["']([^"']*?)["']/i)?.[1] ??
              null,
            canonical,
            openGraph: og,
            twitter,
            jsonLd: jsonLd.length > 0 ? jsonLd : null,
            favicon:
              html.match(
                /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']*?)["']/i,
              )?.[1] ?? null,
          })
        } catch (err) {
          return JSON.stringify({
            url: metaUrl,
            error: err instanceof Error ? err.message : 'Metadata extraction failed',
          })
        }
      }

      case 'agent_evolve': {
        if (!db) return JSON.stringify({ error: 'Database required for agent evolution' })
        const targetAgentId = toolInput.agentId as string
        const windowDays = (toolInput.windowDays as number) ?? 7
        try {
          const { evolveAgent } = await import('../evolution')
          const result = await evolveAgent(db, targetAgentId, { windowDays })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Evolution failed',
          })
        }
      }

      case 'agent_rollback': {
        if (!db) return JSON.stringify({ error: 'Database required for agent rollback' })
        const rbAgentId = toolInput.agentId as string
        const rbVersion = toolInput.version as number
        try {
          const { rollbackToVersion } = await import('../evolution')
          const result = await rollbackToVersion(db, rbAgentId, rbVersion)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Rollback failed',
          })
        }
      }

      case 'agent_analyze': {
        if (!db) return JSON.stringify({ error: 'Database required for agent analysis' })
        const analyzeId = toolInput.agentId as string
        const analyzeWindow = (toolInput.windowDays as number) ?? 7
        try {
          const { analyzeAgentPerformance } = await import('../evolution')
          const result = await analyzeAgentPerformance(db, analyzeId, analyzeWindow)
          if (!result) return JSON.stringify({ error: `Agent ${analyzeId} not found` })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Analysis failed',
          })
        }
      }

      case 'agent_evolution_history': {
        if (!db) return JSON.stringify({ error: 'Database required for evolution history' })
        const histAgentId = toolInput.agentId as string
        const histLimit = (toolInput.limit as number) ?? 10
        try {
          const { getEvolutionHistory } = await import('../evolution')
          const result = await getEvolutionHistory(db, histAgentId, histLimit)
          return JSON.stringify({
            agentId: histAgentId,
            totalCycles: result.cycles.length,
            totalVersions: result.versions.length,
            cycles: result.cycles,
            versions: result.versions.map((v) => ({
              id: v.id,
              version: v.version,
              isActive: v.isActive,
              avgQualityScore: v.avgQualityScore,
              successRate: v.successRate,
              totalRuns: v.totalRuns,
              mutationSummary: v.mutationSummary,
              createdAt: v.createdAt,
            })),
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'History fetch failed',
          })
        }
      }

      case 'verify_claim': {
        const claim = toolInput.claim as string
        const command = toolInput.command as string
        const successPattern = toolInput.successPattern as string | undefined

        // Sandbox audit — classify command before execution
        const audit = auditCommand(command)
        if (audit.verdict === 'block') {
          return JSON.stringify({
            verified: false,
            claim,
            error: `Command blocked by sandbox audit: ${audit.reason}`,
          })
        }

        try {
          const { execSync } = await import('child_process')
          const output = execSync(command, {
            encoding: 'utf8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd(),
          }).trim()

          let verified = true
          let reason = 'Command executed successfully (exit code 0)'

          // Check success pattern if provided
          if (successPattern) {
            const regex = new RegExp(successPattern, 'i')
            if (!regex.test(output)) {
              verified = false
              reason = `Output does not match expected pattern: ${successPattern}`
            }
          }

          // Check for common failure indicators
          const failureIndicators = /\b(FAIL|ERROR|FAILED|failing|exception|panic)\b/i
          if (verified && failureIndicators.test(output)) {
            verified = false
            reason = 'Output contains failure indicators'
          }

          return JSON.stringify({
            verified,
            claim,
            reason,
            evidence: output.slice(0, 3000),
          })
        } catch (err: unknown) {
          const execErr = err as { status?: number; stderr?: string; stdout?: string }
          return JSON.stringify({
            verified: false,
            claim,
            reason: `Command failed with exit code ${execErr.status ?? 'unknown'}`,
            evidence: (execErr.stderr ?? execErr.stdout ?? '').slice(0, 3000),
          })
        }
      }

      case 'compact_context': {
        if (!db) return JSON.stringify({ error: 'Database required for context compaction' })
        const sessionId = toolInput.sessionId as string
        const maxTokens = (toolInput.maxTokens as number) ?? 100000
        const preserveRecent = (toolInput.preserveRecent as number) ?? 10
        try {
          const { chatMessages } = await import('@solarc/db')
          const { eq, asc } = await import('drizzle-orm')
          const { compact, needsCompaction } = await import('./context-compactor')

          const messages = await db
            .select({ role: chatMessages.role, content: chatMessages.text })
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sessionId))
            .orderBy(asc(chatMessages.createdAt))

          const mapped = messages.map((m) => ({
            role: m.role ?? 'user',
            content: m.content ?? '',
          }))

          if (!needsCompaction(mapped, { maxTokens, preserveRecent, preserveSystem: true })) {
            return JSON.stringify({
              compacted: false,
              messageCount: mapped.length,
              reason: 'Context within token limits — no compaction needed',
            })
          }

          const result = compact(mapped, { maxTokens, preserveRecent, preserveSystem: true })
          return JSON.stringify({
            compacted: result.compacted,
            originalMessages: result.originalCount,
            keptMessages: result.compactedCount,
            droppedMessages: result.droppedCount,
            originalTokens: result.originalTokens,
            compactedTokens: result.compactedTokens,
            savedTokens: result.originalTokens - result.compactedTokens,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Compaction failed',
          })
        }
      }

      case 'memory_smart_add': {
        if (!db) return JSON.stringify({ error: 'Database required for smart memory' })
        const msgs = toolInput.messages as Array<{ role: string; content: string }>
        const wsId = toolInput.workspaceId as string | undefined
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { smartMemoryAdd } = await import('../memory')
          const result = await smartMemoryAdd(db, gw, msgs, {
            workspaceId: wsId ?? workspaceId,
          })
          return JSON.stringify({
            factsExtracted: result.extracted.length,
            decisions: result.decisions.map((d) => ({
              action: d.action,
              fact: d.fact,
              existingMemory: d.existingMemoryText ?? null,
              reason: d.reason,
            })),
            summary: {
              added: result.added,
              updated: result.updated,
              deleted: result.deleted,
              unchanged: result.unchanged,
            },
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Smart memory add failed',
          })
        }
      }

      case 'memory_consolidate': {
        if (!db) return JSON.stringify({ error: 'Database required for consolidation' })
        const consWsId = (toolInput.workspaceId as string) ?? workspaceId
        const consLimit = (toolInput.limit as number) ?? 50
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { consolidateMemories } = await import('../memory')
          const result = await consolidateMemories(db, gw, {
            workspaceId: consWsId,
            limit: consLimit,
          })
          return JSON.stringify({
            ...result,
            summary: `Processed ${result.factsProcessed} raw facts → ${result.observationsCreated} new observations, ${result.observationsUpdated} updated, ${result.observationsDeleted} removed`,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Consolidation failed',
          })
        }
      }

      case 'session_summary': {
        if (!db) return JSON.stringify({ error: 'Database required for session summary' })
        const sumSessionId = toolInput.sessionId as string
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { generateSessionSummary } = await import('../intelligence/session-intelligence')
          const result = await generateSessionSummary(db, gw, sumSessionId)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Session summary failed',
          })
        }
      }

      case 'recommend_model': {
        if (!db) return JSON.stringify({ error: 'Database required for model recommendation' })
        const rmAgentId = toolInput.agentId as string
        try {
          const { recommendModel } = await import('../intelligence/adaptive-router')
          const result = await recommendModel(db, rmAgentId)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Model recommendation failed',
          })
        }
      }

      case 'agent_capabilities': {
        if (!db) return JSON.stringify({ error: 'Database required for capability profiling' })
        const capAgentId = toolInput.agentId as string
        try {
          const { profileAgentCapabilities } = await import('../intelligence/adaptive-router')
          const result = await profileAgentCapabilities(db, capAgentId)
          if (!result) return JSON.stringify({ error: `Agent ${capAgentId} not found` })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Capability profiling failed',
          })
        }
      }

      case 'tool_analytics': {
        const analyticsWs = (toolInput.workspaceId as string) ?? workspaceId
        const analytics = getToolAnalytics(analyticsWs)
        const failing = analytics.filter((a) => a.totalCalls >= 3 && a.successRate < 0.5)
        const unused = AGENT_TOOLS.map((t) => t.name).filter(
          (name) => !analytics.some((a) => a.tool === name),
        )
        return JSON.stringify({
          tools: analytics,
          insights: {
            totalTools: AGENT_TOOLS.length,
            usedTools: analytics.length,
            unusedTools: unused.length,
            failingTools: failing.map(
              (f) =>
                `${f.tool}: ${(f.successRate * 100).toFixed(0)}% success (${f.totalCalls} calls)`,
            ),
            unusedToolNames: unused.slice(0, 20),
          },
        })
      }

      case 'auto_evolve_all': {
        if (!db) return JSON.stringify({ error: 'Database required for auto-evolution' })
        const threshold = (toolInput.scoreThreshold as number) ?? 0.6
        const maxAgents = (toolInput.maxAgents as number) ?? 5
        try {
          const { runAutoEvolution } = await import('../evolution')
          const result = await runAutoEvolution(db, {
            scoreThreshold: threshold,
            maxAgentsPerRun: maxAgents,
          })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Auto-evolution failed',
          })
        }
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}
