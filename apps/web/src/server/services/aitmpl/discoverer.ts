/**
 * AITMPL Auto-Discovery
 *
 * Weekly cron: fetches latest AITMPL catalog from GitHub API,
 * diffs against installed components, flags new/updated items,
 * notifies Brain admin dashboard, auto-installs trusted publishers.
 */

import type { AitmplComponent, ComponentCategory, InstallTier } from './installer'
import { AitmplInstaller } from './installer'

export interface CatalogEntry {
  id: string
  name: string
  category: ComponentCategory
  version: string
  author: string
  description: string
  downloads: number
  tags: string[]
  updatedAt: Date
}

export interface CatalogDiff {
  newComponents: CatalogEntry[]
  updatedComponents: Array<{ entry: CatalogEntry; installedVersion: string }>
  removedComponents: string[]
  totalAvailable: number
  totalInstalled: number
}

export interface DiscoveryNotification {
  type: 'new_components' | 'updates_available' | 'security_advisory' | 'auto_installed'
  title: string
  message: string
  components: string[]
  createdAt: Date
  read: boolean
}

export interface InstalledRecord {
  componentId: string
  name: string
  category: ComponentCategory
  version: string
  tier: InstallTier
  entity: string
  installedAt: Date
  autoUpdate: boolean
}

// ── In-memory stores (production: DB) ───────────────────────────────────

const catalogCache: CatalogEntry[] = []
const installedComponents = new Map<string, InstalledRecord>()
const notifications: DiscoveryNotification[] = []

export class AitmplDiscoverer {
  private installer: AitmplInstaller

  constructor(installer?: AitmplInstaller) {
    this.installer = installer ?? new AitmplInstaller()
  }

  // ── Catalog Sync ──────────────────────────────────────────────────────

  /**
   * Fetch the full AITMPL catalog from GitHub.
   * Called by weekly cron job.
   */
  async syncCatalog(): Promise<{ fetched: number; newCount: number; updatedCount: number }> {
    const categories: ComponentCategory[] = ['agents', 'skills', 'commands', 'hooks', 'mcps', 'settings']
    const freshCatalog: CatalogEntry[] = []

    for (const category of categories) {
      const entries = await this.fetchCategoryListing(category)
      freshCatalog.push(...entries)
    }

    // Diff against installed
    const diff = this.diffCatalog(freshCatalog)

    // Update cache
    catalogCache.length = 0
    catalogCache.push(...freshCatalog)

    // Generate notifications
    if (diff.newComponents.length > 0) {
      this.notify({
        type: 'new_components',
        title: `${diff.newComponents.length} new components available`,
        message: `New AITMPL components: ${diff.newComponents.slice(0, 5).map((c) => c.name).join(', ')}${diff.newComponents.length > 5 ? ` and ${diff.newComponents.length - 5} more` : ''}`,
        components: diff.newComponents.map((c) => c.id),
        createdAt: new Date(),
        read: false,
      })
    }

    if (diff.updatedComponents.length > 0) {
      this.notify({
        type: 'updates_available',
        title: `${diff.updatedComponents.length} component updates available`,
        message: `Updates: ${diff.updatedComponents.slice(0, 5).map((c) => `${c.entry.name} (${c.installedVersion} → ${c.entry.version})`).join(', ')}`,
        components: diff.updatedComponents.map((c) => c.entry.id),
        createdAt: new Date(),
        read: false,
      })
    }

    // Auto-install trusted new components
    const autoInstalled = await this.autoInstallTrusted(diff.newComponents)
    if (autoInstalled.length > 0) {
      this.notify({
        type: 'auto_installed',
        title: `${autoInstalled.length} components auto-installed`,
        message: `Auto-installed from trusted publishers: ${autoInstalled.join(', ')}`,
        components: autoInstalled,
        createdAt: new Date(),
        read: false,
      })
    }

    return {
      fetched: freshCatalog.length,
      newCount: diff.newComponents.length,
      updatedCount: diff.updatedComponents.length,
    }
  }

  // ── Diff ──────────────────────────────────────────────────────────────

  /** Compare fresh catalog against installed components */
  diffCatalog(freshCatalog: CatalogEntry[]): CatalogDiff {
    const installedIds = new Set(installedComponents.keys())
    const freshIds = new Set(freshCatalog.map((c) => c.id))

    const newComponents = freshCatalog.filter((c) => !installedIds.has(c.id))

    const updatedComponents: CatalogDiff['updatedComponents'] = []
    for (const entry of freshCatalog) {
      const installed = installedComponents.get(entry.id)
      if (installed && installed.version !== entry.version) {
        updatedComponents.push({ entry, installedVersion: installed.version })
      }
    }

    const removedComponents: string[] = []
    for (const id of installedIds) {
      if (!freshIds.has(id)) removedComponents.push(id)
    }

    return {
      newComponents,
      updatedComponents,
      removedComponents,
      totalAvailable: freshCatalog.length,
      totalInstalled: installedComponents.size,
    }
  }

  // ── Auto-Install ──────────────────────────────────────────────────────

  /** Auto-install components from trusted publishers */
  private async autoInstallTrusted(newComponents: CatalogEntry[]): Promise<string[]> {
    const trusted = newComponents.filter((c) =>
      ['anthropic', 'k-dense', 'aitmpl-official'].includes(c.author)
    )

    const installed: string[] = []
    for (const entry of trusted) {
      const component = await this.installer.fetchComponent(entry.name, entry.category)
      if (!component) continue

      const tier = this.installer.determineTier(component)
      const result = await this.installer.install(component, tier, 'brain')
      if (result.installed) {
        this.recordInstall(component, tier, 'brain')
        installed.push(entry.name)
      }
    }

    return installed
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Get the cached catalog */
  getCatalog(): CatalogEntry[] {
    return [...catalogCache]
  }

  /** Search the catalog */
  searchCatalog(query: string, category?: ComponentCategory): CatalogEntry[] {
    const q = query.toLowerCase()
    return catalogCache.filter((c) => {
      if (category && c.category !== category) return false
      return c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    })
  }

  /** Get catalog stats by category */
  getCatalogStats(): Record<ComponentCategory, number> {
    const stats: Record<string, number> = {
      agents: 0, skills: 0, commands: 0, hooks: 0, mcps: 0, settings: 0,
    }
    for (const entry of catalogCache) {
      stats[entry.category] = (stats[entry.category] ?? 0) + 1
    }
    return stats as Record<ComponentCategory, number>
  }

  /** Get all notifications */
  getNotifications(unreadOnly = false): DiscoveryNotification[] {
    return unreadOnly ? notifications.filter((n) => !n.read) : [...notifications]
  }

  /** Mark a notification as read */
  markRead(index: number): void {
    if (notifications[index]) notifications[index].read = true
  }

  /** Get installed component records */
  getInstalled(): InstalledRecord[] {
    return Array.from(installedComponents.values())
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async fetchCategoryListing(category: ComponentCategory): Promise<CatalogEntry[]> {
    try {
      const res = await fetch(`https://api.github.com/repos/aitmpl/marketplace/contents/${category}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return []

      const entries = (await res.json()) as Array<{ name: string; type: string; path: string }>
      const dirs = entries.filter((e) => e.type === 'dir')

      return dirs.map((dir) => ({
        id: `aitmpl-${category}-${dir.name}`,
        name: dir.name,
        category,
        version: '1.0.0',
        author: 'unknown',
        description: `${category} component: ${dir.name}`,
        downloads: 0,
        tags: [category],
        updatedAt: new Date(),
      }))
    } catch {
      return []
    }
  }

  private recordInstall(component: AitmplComponent, tier: InstallTier, entity: string): void {
    installedComponents.set(component.id, {
      componentId: component.id,
      name: component.name,
      category: component.category,
      version: component.version,
      tier,
      entity,
      installedAt: new Date(),
      autoUpdate: true,
    })
  }

  private notify(notification: DiscoveryNotification): void {
    notifications.unshift(notification)
    // Keep last 50 notifications
    if (notifications.length > 50) notifications.length = 50
  }
}
