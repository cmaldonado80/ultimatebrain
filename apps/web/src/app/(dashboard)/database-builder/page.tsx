'use client'

/**
 * Database Builder — design schemas, browse existing tables,
 * generate domain-specific schemas via AI, and create tables.
 */

import { useState } from 'react'

import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(b: number | null): string {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function typeColor(t: string): string {
  if (t === 'uuid') return 'text-neon-purple'
  if (t.includes('int') || t === 'real') return 'text-neon-blue'
  if (t === 'boolean') return 'text-neon-yellow'
  if (t === 'jsonb' || t === 'json') return 'text-neon-green'
  if (t.includes('timestamp') || t === 'date') return 'text-neon-teal'
  return 'text-slate-300'
}

// ── Component ────────────────────────────────────────────────────────────

export default function DatabaseBuilderPage() {
  const [brief, setBrief] = useState('')
  const [domain, setDomain] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [customSql, setCustomSql] = useState('')

  const tablesQuery = trpc.builder.listDatabaseTables.useQuery(undefined, {
    staleTime: 30_000,
  })
  const utils = trpc.useUtils()

  const generateMut = trpc.builder.generateSchema.useMutation()

  const createTableMut = trpc.builder.createDatabaseTable.useMutation({
    onSuccess: () => {
      utils.builder.listDatabaseTables.invalidate()
      setCustomSql('')
    },
  })

  const batchMut = trpc.builder.executeSchemaBatch.useMutation({
    onSuccess: () => utils.builder.listDatabaseTables.invalidate(),
  })

  const tables = tablesQuery.data ?? []
  const selectedTableData = tables.find((t) => t.name === selectedTable)

  const totalTables = tables.length
  const totalRows = tables.reduce((a, t) => a + t.rowCount, 0)
  const totalSize = tables.reduce((a, t) => a + (t.sizeBytes ?? 0), 0)
  const domainTables = tables.filter(
    (t) =>
      !['users', 'accounts', 'sessions', 'verification_tokens', 'user_roles'].includes(t.name) &&
      !t.name.startsWith('pg_'),
  )

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Database Builder"
        subtitle="Browse tables, design schemas with AI, and create domain-specific database structures"
        count={totalTables}
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard label="Tables" value={totalTables} color="blue" sub="in public schema" />
        <StatCard
          label="Domain Tables"
          value={domainTables.length}
          color="purple"
          sub="non-system"
        />
        <StatCard
          label="Total Rows"
          value={totalRows.toLocaleString()}
          color="green"
          sub="across all tables"
        />
        <StatCard label="Database Size" value={formatBytes(totalSize)} color="yellow" sub="total" />
      </PageGrid>

      {/* Schema Generator */}
      <SectionCard title="Generate Schema with AI" className="mb-6">
        <div className="flex gap-2 items-end mb-3">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 block mb-1">
              Describe what you need to store
            </label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. An astrology app that stores natal charts, readings, client profiles, and transit alerts"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>
          <div className="w-36">
            <label className="text-[10px] text-slate-500 block mb-1">Domain prefix</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. astrology"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!brief.trim() || generateMut.isPending}
            onClick={() => generateMut.mutate({ brief: brief.trim(), domain: domain || undefined })}
          >
            {generateMut.isPending ? 'Generating...' : 'Generate Schema'}
          </button>
        </div>

        {generateMut.isPending && (
          <div className="text-xs text-neon-blue animate-pulse">AI is designing the schema...</div>
        )}

        {/* Generated schema */}
        {generateMut.data && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-slate-300 font-medium">
                Generated {generateMut.data.tables.length} tables
              </div>
              <button
                className="cyber-btn-primary cyber-btn-xs"
                disabled={batchMut.isPending}
                onClick={() => {
                  const stmts = generateMut
                    .data!.sql.split(';')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 10)
                  batchMut.mutate({ statements: stmts })
                }}
              >
                {batchMut.isPending ? 'Creating...' : 'Create All Tables'}
              </button>
            </div>

            {/* Table cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {generateMut.data.tables.map((t, i) => (
                <div key={i} className="bg-bg-deep rounded-lg px-4 py-3 border border-border-dim">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-mono text-neon-blue font-bold">{t.name}</span>
                    <span className="text-[9px] text-slate-500">{t.columns.length} columns</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mb-2">{t.purpose}</div>
                  <div className="space-y-0.5">
                    {t.columns.map((col, ci) => (
                      <div key={ci} className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-300 font-mono w-32 truncate">{col.name}</span>
                        <span className={`font-mono ${typeColor(col.type)}`}>{col.type}</span>
                        {col.constraints && (
                          <span className="text-[9px] text-slate-600">{col.constraints}</span>
                        )}
                        {!col.nullable && (
                          <span className="text-[9px] text-neon-red">NOT NULL</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* SQL preview */}
            <details className="text-[10px]">
              <summary className="text-slate-500 cursor-pointer hover:text-slate-300">
                View SQL
              </summary>
              <pre className="mt-2 p-3 bg-bg-elevated rounded border border-border text-[10px] text-slate-400 overflow-x-auto max-h-64 whitespace-pre-wrap">
                {generateMut.data.sql}
              </pre>
            </details>

            {/* Batch execution results */}
            {batchMut.data && (
              <div className="mt-3 space-y-1">
                {batchMut.data.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <StatusBadge
                      label={r.success ? 'created' : 'failed'}
                      color={r.success ? 'green' : 'red'}
                    />
                    <span className="text-slate-400 font-mono truncate">{r.sql}...</span>
                    {r.error && <span className="text-neon-red text-[9px]">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Custom SQL */}
      <SectionCard title="Custom CREATE TABLE" className="mb-6">
        <div className="flex gap-2 items-end">
          <textarea
            className="cyber-input flex-1 h-20 text-[11px] font-mono resize-none"
            placeholder="CREATE TABLE IF NOT EXISTS my_table (&#10;  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),&#10;  name text NOT NULL,&#10;  created_at timestamp DEFAULT now()&#10;)"
            value={customSql}
            onChange={(e) => setCustomSql(e.target.value)}
          />
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0 self-end"
            disabled={!customSql.trim() || createTableMut.isPending}
            onClick={() => createTableMut.mutate({ sql: customSql.trim() })}
          >
            {createTableMut.isPending ? 'Creating...' : 'Execute'}
          </button>
        </div>
        {createTableMut.data && (
          <div className="mt-2 text-[10px]">
            {createTableMut.data.success ? (
              <span className="text-neon-green">
                Table {createTableMut.data.tableName} created successfully
              </span>
            ) : (
              <span className="text-neon-red">Failed: {createTableMut.data.error}</span>
            )}
          </div>
        )}
      </SectionCard>

      {/* Table Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard title={`Tables (${tables.length})`}>
          {tablesQuery.isLoading ? (
            <div className="text-xs text-slate-600 py-4 text-center animate-pulse">Loading...</div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {tables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedTable(t.name)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer ${
                    selectedTable === t.name
                      ? 'border-neon-blue bg-neon-blue/5'
                      : 'border-border-dim hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-200 truncate flex-1">
                      {t.name}
                    </span>
                    <span className="text-[9px] text-slate-600">{t.columns.length} cols</span>
                  </div>
                  <div className="flex gap-3 text-[9px] text-slate-600 mt-0.5">
                    <span>{t.rowCount.toLocaleString()} rows</span>
                    <span>{formatBytes(t.sizeBytes)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Selected table detail */}
        <div className="lg:col-span-2">
          {!selectedTableData ? (
            <SectionCard title="Table Detail">
              <div className="text-xs text-slate-600 py-8 text-center">
                Select a table to view its schema
              </div>
            </SectionCard>
          ) : (
            <SectionCard title={selectedTableData.name}>
              <div className="flex gap-4 mb-4 text-[10px] text-slate-500">
                <span>{selectedTableData.columns.length} columns</span>
                <span>{selectedTableData.rowCount.toLocaleString()} rows</span>
                <span>{formatBytes(selectedTableData.sizeBytes)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border text-slate-500">
                      <th className="text-left py-1.5 px-2 font-mono">Column</th>
                      <th className="text-left py-1.5 px-2 font-mono">Type</th>
                      <th className="text-left py-1.5 px-2">Nullable</th>
                      <th className="text-left py-1.5 px-2">Default</th>
                      <th className="text-left py-1.5 px-2">PK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableData.columns.map((col) => (
                      <tr key={col.name} className="border-b border-border-dim">
                        <td className="py-1.5 px-2 font-mono text-slate-200">{col.name}</td>
                        <td className={`py-1.5 px-2 font-mono ${typeColor(col.type)}`}>
                          {col.type}
                        </td>
                        <td className="py-1.5 px-2">
                          {col.nullable ? (
                            <span className="text-slate-600">yes</span>
                          ) : (
                            <span className="text-neon-red">no</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-slate-500 truncate max-w-[200px]">
                          {col.defaultValue ?? '—'}
                        </td>
                        <td className="py-1.5 px-2">
                          {col.isPrimaryKey && <StatusBadge label="PK" color="blue" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
