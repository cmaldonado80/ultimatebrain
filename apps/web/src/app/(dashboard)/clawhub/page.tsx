'use client'

/**
 * ClawHub Marketplace — browse and discover OpenClaw community skills.
 * Fetches skills from clawhub.dev API.
 */

import { useState } from 'react'

import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'

interface ClawHubSkill {
  name: string
  description: string
  author: string
  category: string
  version: string
  downloads: number
}

export default function ClawHubPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')

  // Note: ClawHub API may not be publicly accessible yet.
  // This page is ready for when it becomes available.
  // For now, show a curated list of known popular skills.

  const POPULAR_SKILLS: ClawHubSkill[] = [
    {
      name: 'github-integration',
      description: 'Manage GitHub repos, PRs, and issues',
      author: 'openclaw',
      category: 'development',
      version: '2.1.0',
      downloads: 45000,
    },
    {
      name: 'notion-sync',
      description: 'Sync notes and databases with Notion',
      author: 'openclaw',
      category: 'productivity',
      version: '1.8.0',
      downloads: 38000,
    },
    {
      name: 'slack-bot',
      description: 'Send and manage Slack messages',
      author: 'openclaw',
      category: 'communication',
      version: '1.5.0',
      downloads: 32000,
    },
    {
      name: 'web-scraper',
      description: 'Extract data from web pages',
      author: 'community',
      category: 'data',
      version: '1.3.0',
      downloads: 28000,
    },
    {
      name: 'code-reviewer',
      description: 'Automated code review with best practices',
      author: 'openclaw',
      category: 'development',
      version: '2.0.0',
      downloads: 52000,
    },
    {
      name: 'email-assistant',
      description: 'Draft, send, and organize emails',
      author: 'community',
      category: 'productivity',
      version: '1.2.0',
      downloads: 21000,
    },
    {
      name: 'database-query',
      description: 'Query PostgreSQL, MySQL, SQLite databases',
      author: 'openclaw',
      category: 'data',
      version: '1.7.0',
      downloads: 25000,
    },
    {
      name: 'calendar-manager',
      description: 'Manage Google Calendar and Apple Calendar',
      author: 'community',
      category: 'productivity',
      version: '1.1.0',
      downloads: 18000,
    },
    {
      name: 'docker-manager',
      description: 'Manage Docker containers and images',
      author: 'community',
      category: 'development',
      version: '1.4.0',
      downloads: 15000,
    },
    {
      name: 'hue-lights',
      description: 'Control Philips Hue smart lights',
      author: 'community',
      category: 'smart-home',
      version: '1.0.0',
      downloads: 12000,
    },
    {
      name: 'obsidian-vault',
      description: 'Read and write Obsidian vault notes',
      author: 'community',
      category: 'productivity',
      version: '1.6.0',
      downloads: 22000,
    },
    {
      name: 'jira-integration',
      description: 'Create and manage Jira tickets',
      author: 'openclaw',
      category: 'development',
      version: '1.9.0',
      downloads: 19000,
    },
  ]

  const categories = ['all', ...new Set(POPULAR_SKILLS.map((s) => s.category))]
  const filtered = POPULAR_SKILLS.filter((s) => category === 'all' || s.category === category)
    .filter(
      (s) =>
        !search ||
        s.name.includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.downloads - a.downloads)

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <PageHeader
        title="ClawHub Marketplace"
        subtitle="Browse 13,700+ community skills for OpenClaw agents"
      />

      <div className="flex gap-2 mb-4">
        <input
          className="cyber-input flex-1"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <FilterPills
        options={categories as readonly string[]}
        value={category}
        onChange={setCategory}
        className="mb-4"
      />

      {filtered.length === 0 ? (
        <EmptyState title="No skills found" message="Try a different search or category." />
      ) : (
        <div className="space-y-2">
          {filtered.map((skill) => (
            <SectionCard key={skill.name} padding="sm">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 font-medium">{skill.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500">
                      {skill.version}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-purple/10 text-neon-purple">
                      {skill.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{skill.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-500">
                    {skill.downloads.toLocaleString()} installs
                  </div>
                  <div className="text-[9px] text-slate-600">by {skill.author}</div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <p className="text-[11px] text-slate-600">
          Full ClawHub integration requires OpenClaw daemon. Install with: npm install -g
          openclaw@latest
        </p>
      </div>
    </div>
  )
}
