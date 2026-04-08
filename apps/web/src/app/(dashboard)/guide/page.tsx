'use client'

/**
 * User Guide — step-by-step documentation for using the AI Corporation.
 *
 * Organized by user journey: getting started → daily work → advanced features.
 * Each section is collapsible so users can focus on what they need.
 */

import { useState } from 'react'

import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'

interface GuideSection {
  id: string
  title: string
  icon: string
  steps: { title: string; description: string }[]
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '▷',
    steps: [
      {
        title: '1. Complete Onboarding',
        description:
          'Go to Platform → Onboarding. Name your corporation, choose your first department template (Engineering, Design, Security, etc.), set optional budget limits, and your AI team will be created automatically with specialized agents.',
      },
      {
        title: '2. Explore Mission Control',
        description:
          'Your home dashboard shows key metrics: how many departments, agents, active tasks, and notifications. Use the Quick Actions buttons to jump to common tasks.',
      },
      {
        title: '3. Chat with Your Agents',
        description:
          'Go to Chat (Main section). Click "Start New Chat", select an agent from the dropdown, and type your message. Agents can use tools (search the web, read/write files, create tickets) to help you.',
      },
      {
        title: '4. Check System Health',
        description:
          'Visit Insights → System Health to see if everything is running smoothly. Green means healthy, yellow means something needs attention, red means action required.',
      },
    ],
  },
  {
    id: 'managing-work',
    title: 'Managing Work',
    icon: '▤',
    steps: [
      {
        title: 'Create a Ticket',
        description:
          'Go to Work → Tickets → click "+ New Ticket". Give it a title, description, priority (low/medium/high/critical), and optionally assign an agent. The corporation will pick it up and work on it.',
      },
      {
        title: 'Track Progress on the Board',
        description:
          "Work → Project Board shows a Kanban view: Backlog → Queued → In Progress → Review → Done. Cards show who's working on what and the priority level.",
      },
      {
        title: 'Review Agent Work',
        description:
          'When agents complete work, check Work → Artifacts to see what they produced. You can preview HTML pages live, view source code, and request improvements.',
      },
      {
        title: 'Create a Project',
        description:
          'For larger initiatives, go to Work → Project Board and create a project. Projects group related tickets together and track overall progress.',
      },
    ],
  },
  {
    id: 'creating-artifacts',
    title: 'Creating Artifacts (Webpages & Documents)',
    icon: '◈',
    steps: [
      {
        title: '1. Open Artifact Studio',
        description:
          'Go to Work → Artifacts. This is where all agent-created outputs live — HTML pages, code, documents.',
      },
      {
        title: '2. Create a New Page',
        description:
          'Click "+ Create New Page" at the bottom of the artifact list. This creates a blank HTML page with Tailwind CSS ready to use.',
      },
      {
        title: '3. Preview Live',
        description:
          'Click any artifact in the list to see a live preview on the right. The preview renders the actual HTML — not a screenshot, the real page.',
      },
      {
        title: '4. Improve with AI',
        description:
          'Below the preview, type what you want changed in the "Improve This Artifact" box. Examples: "Add a pricing section", "Make the header blue", "Add a contact form". The corporation creates a ticket and an agent will make the change.',
      },
      {
        title: '5. Open Full Screen',
        description:
          'Click "Open in new tab" to see the artifact at its own URL. You can share this link with others.',
      },
    ],
  },
  {
    id: 'configuring-corporation',
    title: 'Configuring Your Corporation',
    icon: '⚿',
    steps: [
      {
        title: 'Add New Departments',
        description:
          'Go to Organization → Departments. Click "Create" and choose from 7 templates: Engineering, Design, Security, Hospitality, Healthcare, Marketing, or Astrology. Each comes with pre-configured specialist agents.',
      },
      {
        title: 'Manage Agents',
        description:
          'Go to Work → Agents. Here you can create new agents, update their profiles (personality and expertise), assign AI models, and import/export agent configurations.',
      },
      {
        title: 'Set Budgets',
        description:
          'Go to Settings → General to configure token budgets. Budgets control how much each department can spend on AI model calls. Visit Insights → Finance to see spending reports.',
      },
      {
        title: 'Add Team Members',
        description:
          'Go to Organization → Members to invite people to your corporation. Assign roles: Admin (full access), Operator (manage agents and work), or Viewer (read-only).',
      },
      {
        title: 'Configure API Keys',
        description:
          'Go to Settings → Secrets & Keys to add LLM provider API keys (Anthropic, OpenAI, Google). At least one key is needed for agents to work.',
      },
    ],
  },
  {
    id: 'building-workflows',
    title: 'Building Workflows & Automation',
    icon: '⤳',
    steps: [
      {
        title: 'Visual Workflow Builder',
        description:
          'Go to Build → Workflow Builder. Drag and drop blocks (Trigger, Agent, Tool, Condition, LLM, Memory, Output) onto the canvas to create automated workflows. Connect blocks to define the flow.',
      },
      {
        title: 'Use Playbooks',
        description:
          'Go to Build → Playbooks. Playbooks are reusable templates for common tasks. The system auto-generates playbooks from recurring work patterns.',
      },
      {
        title: 'Set Up Routines',
        description:
          'Routines are recurring automated tasks. Create them via the agent chat: ask an agent to "run this task every morning at 9am" and it will set up a scheduled routine.',
      },
      {
        title: 'Browse Skills & Tools',
        description:
          'Go to Build → Skills & Tools to see all 71+ tools available to agents: file operations, web search, code review, database queries, and more.',
      },
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring & Insights',
    icon: '◎',
    steps: [
      {
        title: 'CEO Dashboard',
        description:
          'Insights → CEO Dashboard gives an executive overview: department health, safety compliance, risk level, and recent activity across the corporation.',
      },
      {
        title: 'System Health',
        description:
          'Insights → System Health shows real-time metrics with trend charts. The system automatically heals itself — restarting failed agents, clearing stuck tasks, and adjusting resource limits.',
      },
      {
        title: 'Learning Trends',
        description:
          'Insights → Learning Trends shows whether the system is getting smarter over time. Track patterns learned, learning signal activity, and healing system performance.',
      },
      {
        title: 'Financial Reports',
        description:
          'Insights → Finance shows spending by department, cost per model, and daily trends. Settings → Agent ROI ranks agents by their return on investment.',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced Features',
    icon: '⚡',
    steps: [
      {
        title: 'Self-Healing System',
        description:
          'The corporation automatically detects problems every 10 minutes: stuck tasks, failing agents, high error rates. It restarts agents, clears locks, adjusts resources, and even fixes its own code bugs.',
      },
      {
        title: 'Learning & Instincts',
        description:
          'The system learns patterns from every interaction. When it detects "every time X happens, doing Y works", it promotes this as a learned pattern and applies it automatically in future situations.',
      },
      {
        title: 'Collective Decisions',
        description:
          'For high-stakes decisions, multiple agents can debate a topic. Each agent states their position, votes are weighted by reputation, and the winning position is executed. View history in Advanced → Decisions.',
      },
      {
        title: 'Stress Testing',
        description:
          'The system runs weekly chaos engineering tests — deliberately injecting failures to find weaknesses. This makes the system stronger over time. View results in Advanced → Stress Tests.',
      },
      {
        title: 'Org Restructuring',
        description:
          'The system analyzes bottlenecks monthly: overloaded agents, idle workers, missing skills. It proposes restructuring changes. Review proposals in Advanced → Restructuring.',
      },
    ],
  },
]

export default function UserGuidePage() {
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started')

  return (
    <div className="p-6 text-slate-50 max-w-4xl mx-auto">
      <PageHeader
        title="User Guide"
        subtitle="Step-by-step guide to using your AI Corporation — from first setup to advanced features"
      />

      <div className="space-y-3">
        {GUIDE_SECTIONS.map((section) => {
          const isExpanded = expandedSection === section.id
          return (
            <div key={section.id} className="cyber-card overflow-hidden">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-elevated/50 transition-colors"
              >
                <span className="text-lg">{section.icon}</span>
                <span className="font-orbitron text-sm font-semibold flex-1">{section.title}</span>
                <span className="text-slate-500 text-xs">{section.steps.length} steps</span>
                <span
                  className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                >
                  ▸
                </span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-border-dim">
                  {section.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 pt-4">
                      <div className="w-6 h-6 rounded-full bg-neon-teal/10 border border-neon-teal/30 flex items-center justify-center text-[10px] text-neon-teal font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200 mb-1">{step.title}</div>
                        <div className="text-xs text-slate-400 leading-relaxed">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <SectionCard title="Need More Help?" className="mt-6">
        <div className="text-xs text-slate-400 space-y-2">
          <p>
            <span className="text-neon-teal font-mono">Chat</span> — Ask any agent for help. They
            understand the system and can guide you.
          </p>
          <p>
            <span className="text-neon-teal font-mono">Cmd+K</span> — Press Cmd+K (or Ctrl+K)
            anywhere to search for any page, agent, or feature.
          </p>
          <p>
            <span className="text-neon-teal font-mono">System Intelligence Agent</span> — Start a
            chat and ask: "What happened today?" or "How is engineering performing?" for real-time
            answers about your corporation.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
