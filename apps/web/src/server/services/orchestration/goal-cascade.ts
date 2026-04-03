/**
 * Strategic Goal Cascade
 *
 * Corporation OKRs flow down to department KPIs to agent tasks.
 * When a goal is at risk, the system automatically generates initiatives.
 *
 * Hierarchy:
 *   Corporation Mission → OKRs (quarterly)
 *     → Department KPIs (monthly, derived from OKRs)
 *       → Agent Tasks (daily, derived from KPIs)
 *
 * Every piece of work traces back to WHY it matters.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface OKR {
  id: string
  objective: string
  keyResults: KeyResult[]
  quarter: string // e.g. "2026-Q2"
  owner: string // department or 'corporation'
}

export interface KeyResult {
  id: string
  description: string
  metric: string
  target: number
  current: number
  unit: string
  weight: number // 0-1, how much this KR contributes to the objective
}

export interface DepartmentKPI {
  departmentId: string
  departmentName: string
  parentOkrId: string // traces to corporation OKR
  kpi: string
  target: number
  current: number
  unit: string
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved'
}

export interface GoalAlignment {
  ticketId?: string
  taskTitle: string
  agentId?: string
  departmentKpiId: string
  okrId: string
  contribution: string // how this task helps the goal
}

export interface CascadeSnapshot {
  timestamp: Date
  okrs: OKR[]
  departmentKPIs: DepartmentKPI[]
  alignments: GoalAlignment[]
  atRiskGoals: Array<{ department: string; goal: string; progress: number }>
}

// ── Goal Cascade Engine ──────────────────────────────────────────────────

export class GoalCascadeEngine {
  private okrs: OKR[] = []
  private departmentKPIs: DepartmentKPI[] = []
  private alignments: GoalAlignment[] = []
  private maxAlignments = 500

  /**
   * Set corporation-level OKRs.
   */
  setOKRs(okrs: OKR[]) {
    this.okrs = okrs
  }

  /**
   * Derive department KPIs from corporation OKRs.
   * Each department gets KPIs based on which OKRs they can influence.
   */
  deriveDepartmentKPIs(
    departments: Array<{ id: string; name: string; domain: string }>,
  ): DepartmentKPI[] {
    const kpis: DepartmentKPI[] = []

    for (const dept of departments) {
      for (const okr of this.okrs) {
        for (const kr of okr.keyResults) {
          // Match KR to department by keyword heuristic
          if (this.isRelevant(kr, dept.domain)) {
            const progress = kr.target > 0 ? kr.current / kr.target : 0
            kpis.push({
              departmentId: dept.id,
              departmentName: dept.name,
              parentOkrId: okr.id,
              kpi: `${dept.name}: ${kr.description}`,
              target: kr.target,
              current: kr.current,
              unit: kr.unit,
              status:
                progress >= 1
                  ? 'achieved'
                  : progress >= 0.7
                    ? 'on_track'
                    : progress >= 0.4
                      ? 'at_risk'
                      : 'behind',
            })
          }
        }
      }
    }

    this.departmentKPIs = kpis
    return kpis
  }

  /**
   * Record that a task/ticket contributes to a goal.
   */
  recordAlignment(alignment: GoalAlignment) {
    this.alignments.push(alignment)
    while (this.alignments.length > this.maxAlignments) this.alignments.shift()
  }

  /**
   * Get goals that are at risk (for Initiative Engine signals).
   */
  getAtRiskGoals(): Array<{ department: string; goal: string; progress: number }> {
    return this.departmentKPIs
      .filter((kpi) => kpi.status === 'at_risk' || kpi.status === 'behind')
      .map((kpi) => ({
        department: kpi.departmentName,
        goal: kpi.kpi,
        progress: kpi.target > 0 ? kpi.current / kpi.target : 0,
      }))
  }

  /**
   * Get OKR progress summary.
   */
  getOKRProgress(): Array<{
    okrId: string
    objective: string
    progress: number
    keyResultProgress: Array<{ description: string; progress: number; status: string }>
  }> {
    return this.okrs.map((okr) => {
      const krProgress = okr.keyResults.map((kr) => {
        const progress = kr.target > 0 ? kr.current / kr.target : 0
        return {
          description: kr.description,
          progress: Math.min(1, progress),
          status:
            progress >= 1
              ? 'achieved'
              : progress >= 0.7
                ? 'on_track'
                : progress >= 0.4
                  ? 'at_risk'
                  : 'behind',
        }
      })

      // Weighted average of key results
      const totalWeight = okr.keyResults.reduce((a, kr) => a + kr.weight, 0)
      const weightedProgress =
        totalWeight > 0
          ? okr.keyResults.reduce((a, kr) => {
              const p = kr.target > 0 ? Math.min(1, kr.current / kr.target) : 0
              return a + p * kr.weight
            }, 0) / totalWeight
          : 0

      return {
        okrId: okr.id,
        objective: okr.objective,
        progress: weightedProgress,
        keyResultProgress: krProgress,
      }
    })
  }

  /**
   * Get full cascade snapshot.
   */
  getSnapshot(): CascadeSnapshot {
    return {
      timestamp: new Date(),
      okrs: this.okrs,
      departmentKPIs: this.departmentKPIs,
      alignments: this.alignments.slice(-50),
      atRiskGoals: this.getAtRiskGoals(),
    }
  }

  /**
   * Update a key result's current value.
   */
  updateKeyResult(okrId: string, krId: string, current: number) {
    const okr = this.okrs.find((o) => o.id === okrId)
    if (!okr) return
    const kr = okr.keyResults.find((k) => k.id === krId)
    if (kr) kr.current = current

    // Recalculate department KPI statuses
    for (const kpi of this.departmentKPIs) {
      if (kpi.parentOkrId === okrId) {
        const progress = kpi.target > 0 ? kpi.current / kpi.target : 0
        kpi.status =
          progress >= 1
            ? 'achieved'
            : progress >= 0.7
              ? 'on_track'
              : progress >= 0.4
                ? 'at_risk'
                : 'behind'
      }
    }
  }

  private isRelevant(kr: KeyResult, domain: string): boolean {
    const krText = `${kr.description} ${kr.metric}`.toLowerCase()
    const domainWords = domain.toLowerCase().split(/[\s-_]+/)
    return domainWords.some((w) => w.length > 3 && krText.includes(w))
  }
}
