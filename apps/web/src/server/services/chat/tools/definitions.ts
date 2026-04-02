/**
 * Tool Definitions — All 71 agent tool schemas in Anthropic format.
 *
 * Extracted from tool-executor.ts for maintainability.
 * Each tool has: name, description, input_schema.
 * The executor dispatch lives in tool-executor.ts.
 */

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

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
  // compact_context tool removed — compaction is now automatic in the chat pipeline
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
