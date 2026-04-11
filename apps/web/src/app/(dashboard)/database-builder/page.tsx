'use client'

/**
 * Database Builder — browse tables, design schemas with AI,
 * add/edit/delete columns, create/drop tables interactively.
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
  if (t.includes('int') || t === 'real' || t === 'numeric') return 'text-neon-blue'
  if (t === 'boolean') return 'text-neon-yellow'
  if (t === 'jsonb' || t === 'json') return 'text-neon-green'
  if (t.includes('timestamp') || t === 'date') return 'text-neon-teal'
  return 'text-slate-300'
}

const PG_TYPES = [
  'text',
  'integer',
  'uuid',
  'boolean',
  'jsonb',
  'real',
  'timestamp',
  'date',
  'bigint',
  'smallint',
  'numeric',
  'varchar',
]

// ── Component ────────────────────────────────────────────────────────────

export default function DatabaseBuilderPage() {
  const [brief, setBrief] = useState('')
  const [domain, setDomain] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [customSql, setCustomSql] = useState('')

  // Add column form
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState('text')
  const [newColNullable, setNewColNullable] = useState(true)
  const [newColDefault, setNewColDefault] = useState('')

  // Edit schema proposal state
  const [editableProposal, setEditableProposal] = useState<Array<{
    name: string
    purpose: string
    columns: Array<{
      name: string
      type: string
      nullable: boolean
      defaultValue?: string
      constraints?: string
    }>
  }> | null>(null)

  const tablesQuery = trpc.builder.listDatabaseTables.useQuery(undefined, { staleTime: 30_000 })
  const utils = trpc.useUtils()

  const generateMut = trpc.builder.generateSchema.useMutation({
    onSuccess: (data) => {
      setEditableProposal(
        data.tables.map((t) => ({
          name: t.name,
          purpose: t.purpose,
          columns: t.columns.map((c) => ({ ...c })),
        })),
      )
    },
  })

  const createTableMut = trpc.builder.createDatabaseTable.useMutation({
    onSuccess: () => {
      utils.builder.listDatabaseTables.invalidate()
      setCustomSql('')
    },
  })

  const batchMut = trpc.builder.executeSchemaBatch.useMutation({
    onSuccess: () => utils.builder.listDatabaseTables.invalidate(),
  })

  const dropTableMut = trpc.builder.dropDatabaseTable.useMutation({
    onSuccess: () => {
      utils.builder.listDatabaseTables.invalidate()
      setSelectedTable(null)
    },
  })

  const addColumnMut = trpc.builder.addDatabaseColumn.useMutation({
    onSuccess: () => {
      utils.builder.listDatabaseTables.invalidate()
      setNewColName('')
      setNewColDefault('')
    },
  })

  const dropColumnMut = trpc.builder.dropDatabaseColumn.useMutation({
    onSuccess: () => utils.builder.listDatabaseTables.invalidate(),
  })

  const tables = tablesQuery.data ?? []
  const selectedTableData = tables.find((t) => t.name === selectedTable)
  const totalTables = tables.length
  const totalRows = tables.reduce((a, t) => a + t.rowCount, 0)
  const totalSize = tables.reduce((a, t) => a + (t.sizeBytes ?? 0), 0)

  // Build SQL from editable proposal
  function buildSqlFromProposal() {
    if (!editableProposal) return ''
    return editableProposal
      .map((t) => {
        const cols = t.columns.map((c) => {
          let def = `  ${c.name} ${c.type}`
          if (!c.nullable) def += ' NOT NULL'
          if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
          if (c.constraints) def += ` ${c.constraints}`
          return def
        })
        return `CREATE TABLE IF NOT EXISTS ${t.name} (\n${cols.join(',\n')}\n);`
      })
      .join('\n\n')
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Database Builder"
        subtitle="Browse tables, design schemas with AI, add/remove columns, create and drop tables"
        count={totalTables}
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard label="Tables" value={totalTables} color="blue" sub="in database" />
        <StatCard
          label="Total Rows"
          value={totalRows.toLocaleString()}
          color="green"
          sub="across all tables"
        />
        <StatCard label="Size" value={formatBytes(totalSize)} color="yellow" sub="total" />
        <StatCard
          label="Selected"
          value={selectedTable ?? 'none'}
          color="purple"
          sub={selectedTableData ? `${selectedTableData.columns.length} columns` : 'click a table'}
        />
      </PageGrid>

      {/* ── AI Schema Generator ──────────────────────────────────────────── */}
      <SectionCard title="Generate Schema with AI" className="mb-6">
        <div className="flex gap-2 items-end mb-3">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 block mb-1">Describe what you need</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. An astrology app with natal charts, readings, client profiles, transit alerts"
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
          <div className="text-xs text-neon-blue animate-pulse">AI is designing your schema...</div>
        )}

        {/* Editable schema proposal */}
        {editableProposal && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-slate-300 font-medium">
                {editableProposal.length} tables — edit before creating
              </div>
              <div className="flex gap-2">
                <button
                  className="cyber-btn-secondary cyber-btn-xs"
                  onClick={() => setEditableProposal(null)}
                >
                  Discard
                </button>
                <button
                  className="cyber-btn-primary cyber-btn-xs"
                  disabled={batchMut.isPending}
                  onClick={() => {
                    const stmts = buildSqlFromProposal()
                      .split(';')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 10)
                    batchMut.mutate({ statements: stmts })
                  }}
                >
                  {batchMut.isPending ? 'Creating...' : 'Create All Tables'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {editableProposal.map((table, ti) => (
                <div key={ti} className="bg-bg-deep rounded-lg px-4 py-3 border border-border-dim">
                  {/* Table header */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className="cyber-input cyber-input-sm text-neon-blue font-mono font-bold flex-1"
                      value={table.name}
                      onChange={(e) => {
                        const updated = [...editableProposal]
                        updated[ti] = { ...updated[ti]!, name: e.target.value }
                        setEditableProposal(updated)
                      }}
                    />
                    <button
                      className="text-[10px] text-slate-600 hover:text-neon-red cursor-pointer"
                      onClick={() =>
                        setEditableProposal(editableProposal.filter((_, i) => i !== ti))
                      }
                      title="Remove table"
                    >
                      Remove table
                    </button>
                  </div>

                  {/* Columns */}
                  <div className="space-y-1">
                    {table.columns.map((col, ci) => (
                      <div key={ci} className="flex items-center gap-2 text-[10px]">
                        <input
                          className="cyber-input cyber-input-sm font-mono w-36"
                          value={col.name}
                          onChange={(e) => {
                            const updated = [...editableProposal]
                            updated[ti] = { ...updated[ti]!, columns: [...updated[ti]!.columns] }
                            updated[ti]!.columns[ci] = {
                              ...updated[ti]!.columns[ci]!,
                              name: e.target.value,
                            }
                            setEditableProposal(updated)
                          }}
                        />
                        <select
                          className="cyber-input cyber-input-sm font-mono w-28"
                          value={col.type}
                          onChange={(e) => {
                            const updated = [...editableProposal]
                            updated[ti] = { ...updated[ti]!, columns: [...updated[ti]!.columns] }
                            updated[ti]!.columns[ci] = {
                              ...updated[ti]!.columns[ci]!,
                              type: e.target.value,
                            }
                            setEditableProposal(updated)
                          }}
                        >
                          {PG_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-slate-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!col.nullable}
                            onChange={(e) => {
                              const updated = [...editableProposal]
                              updated[ti] = { ...updated[ti]!, columns: [...updated[ti]!.columns] }
                              updated[ti]!.columns[ci] = {
                                ...updated[ti]!.columns[ci]!,
                                nullable: !e.target.checked,
                              }
                              setEditableProposal(updated)
                            }}
                          />
                          NOT NULL
                        </label>
                        {col.constraints && (
                          <span className="text-[9px] text-slate-600 truncate max-w-24">
                            {col.constraints}
                          </span>
                        )}
                        <button
                          className="text-slate-700 hover:text-neon-red cursor-pointer ml-auto"
                          onClick={() => {
                            const updated = [...editableProposal]
                            updated[ti] = {
                              ...updated[ti]!,
                              columns: updated[ti]!.columns.filter((_, i) => i !== ci),
                            }
                            setEditableProposal(updated)
                          }}
                          title="Remove column"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add column to proposal */}
                  <button
                    className="text-[10px] text-neon-blue hover:text-neon-green mt-2 cursor-pointer"
                    onClick={() => {
                      const updated = [...editableProposal]
                      updated[ti] = {
                        ...updated[ti]!,
                        columns: [
                          ...updated[ti]!.columns,
                          { name: 'new_column', type: 'text', nullable: true },
                        ],
                      }
                      setEditableProposal(updated)
                    }}
                  >
                    + Add column
                  </button>
                </div>
              ))}
            </div>

            {/* Add new table to proposal */}
            <button
              className="text-[10px] text-neon-blue hover:text-neon-green mt-3 cursor-pointer"
              onClick={() => {
                setEditableProposal([
                  ...editableProposal,
                  {
                    name: 'new_table',
                    purpose: '',
                    columns: [
                      {
                        name: 'id',
                        type: 'uuid',
                        nullable: false,
                        defaultValue: 'gen_random_uuid()',
                        constraints: 'PRIMARY KEY',
                      },
                      {
                        name: 'created_at',
                        type: 'timestamp',
                        nullable: false,
                        defaultValue: 'now()',
                      },
                    ],
                  },
                ])
              }}
            >
              + Add table
            </button>

            {/* SQL preview */}
            <details className="text-[10px] mt-3">
              <summary className="text-slate-500 cursor-pointer hover:text-slate-300">
                View SQL
              </summary>
              <pre className="mt-2 p-3 bg-bg-elevated rounded border border-border text-[10px] text-slate-400 overflow-x-auto max-h-48 whitespace-pre-wrap">
                {buildSqlFromProposal()}
              </pre>
            </details>

            {/* Batch results */}
            {batchMut.data && (
              <div className="mt-3 space-y-1">
                {batchMut.data.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <StatusBadge
                      label={r.success ? 'ok' : 'fail'}
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

      {/* ── Custom SQL ───────────────────────────────────────────────────── */}
      <SectionCard title="Custom CREATE TABLE" className="mb-6">
        <div className="flex gap-2 items-end">
          <textarea
            className="cyber-input flex-1 h-16 text-[11px] font-mono resize-none"
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
              <span className="text-neon-green">Table {createTableMut.data.tableName} created</span>
            ) : (
              <span className="text-neon-red">Failed: {createTableMut.data.error}</span>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Table Browser + Detail ───────────────────────────────────────── */}
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

        <div className="lg:col-span-2">
          {!selectedTableData ? (
            <SectionCard title="Table Detail">
              <div className="text-xs text-slate-600 py-8 text-center">
                Select a table to view and edit its schema
              </div>
            </SectionCard>
          ) : (
            <SectionCard title={selectedTableData.name}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-4 text-[10px] text-slate-500">
                  <span>{selectedTableData.columns.length} columns</span>
                  <span>{selectedTableData.rowCount.toLocaleString()} rows</span>
                  <span>{formatBytes(selectedTableData.sizeBytes)}</span>
                </div>
                <button
                  className="cyber-btn-secondary cyber-btn-xs text-neon-red"
                  disabled={dropTableMut.isPending}
                  onClick={() => {
                    if (confirm(`DROP TABLE "${selectedTableData.name}"? This cannot be undone.`))
                      dropTableMut.mutate({ tableName: selectedTableData.name })
                  }}
                >
                  {dropTableMut.isPending ? 'Dropping...' : 'Drop Table'}
                </button>
              </div>

              {dropTableMut.data && !dropTableMut.data.success && (
                <div className="text-[10px] text-neon-red mb-3">{dropTableMut.data.error}</div>
              )}

              {/* Column table */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border text-slate-500">
                      <th className="text-left py-1.5 px-2 font-mono">Column</th>
                      <th className="text-left py-1.5 px-2 font-mono">Type</th>
                      <th className="text-left py-1.5 px-2">Nullable</th>
                      <th className="text-left py-1.5 px-2">Default</th>
                      <th className="text-left py-1.5 px-2">PK</th>
                      <th className="text-right py-1.5 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableData.columns.map((col) => (
                      <tr key={col.name} className="border-b border-border-dim group">
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
                        <td className="py-1.5 px-2 text-slate-500 truncate max-w-[150px]">
                          {col.defaultValue ?? '—'}
                        </td>
                        <td className="py-1.5 px-2">
                          {col.isPrimaryKey && <StatusBadge label="PK" color="blue" />}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {!col.isPrimaryKey && col.name !== 'created_at' && col.name !== 'id' && (
                            <button
                              className="text-slate-700 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px]"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Drop column "${col.name}" from "${selectedTableData.name}"?`,
                                  )
                                )
                                  dropColumnMut.mutate({
                                    tableName: selectedTableData.name,
                                    columnName: col.name,
                                  })
                              }}
                            >
                              drop
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add column form */}
              <div className="border-t border-border pt-3">
                <div className="text-[10px] text-slate-500 mb-2">Add Column</div>
                <div className="flex gap-2 items-end">
                  <div className="w-36">
                    <input
                      className="cyber-input cyber-input-sm w-full font-mono"
                      placeholder="column_name"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                    />
                  </div>
                  <div className="w-28">
                    <select
                      className="cyber-input cyber-input-sm w-full font-mono"
                      value={newColType}
                      onChange={(e) => setNewColType(e.target.value)}
                    >
                      {PG_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!newColNullable}
                      onChange={(e) => setNewColNullable(!e.target.checked)}
                    />
                    NOT NULL
                  </label>
                  <div className="w-28">
                    <input
                      className="cyber-input cyber-input-sm w-full font-mono"
                      placeholder="default"
                      value={newColDefault}
                      onChange={(e) => setNewColDefault(e.target.value)}
                    />
                  </div>
                  <button
                    className="cyber-btn-primary cyber-btn-xs flex-shrink-0"
                    disabled={!newColName.trim() || addColumnMut.isPending}
                    onClick={() =>
                      addColumnMut.mutate({
                        tableName: selectedTableData.name,
                        columnName: newColName.trim(),
                        columnType: newColType,
                        nullable: newColNullable,
                        defaultValue: newColDefault || undefined,
                      })
                    }
                  >
                    {addColumnMut.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {addColumnMut.data && !addColumnMut.data.success && (
                  <div className="mt-1 text-[10px] text-neon-red">{addColumnMut.data.error}</div>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
