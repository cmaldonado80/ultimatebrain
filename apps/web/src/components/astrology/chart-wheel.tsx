'use client'

/**
 * ChartWheel — SVG natal chart visualization.
 *
 * Renders a traditional Western natal chart wheel with:
 * - Zodiac ring (12 signs colored by element)
 * - House lines (12 cusps)
 * - Planet glyphs positioned by ecliptic longitude
 * - Aspect lines connecting planets
 * - ASC/MC/DSC/IC axis markers
 */

import { memo } from 'react'

import {
  ASPECT_COLORS,
  ASPECT_DASH,
  ELEMENT_COLORS,
  PLANET_COLORS,
  PLANET_GLYPHS,
  SIGN_ELEMENT,
  SIGN_GLYPHS,
  ZODIAC_SIGNS,
} from './chart-constants'

// ── Types ────────────────────────────────────────────────────────────────

interface Planet {
  name: string
  longitude: number // 0-360 ecliptic
  retrograde: boolean
  house: number
}

interface Aspect {
  planet1: string
  planet2: string
  type: string
  orb: number
}

interface ChartWheelProps {
  planets: Planet[]
  houses: number[] // 12 cusp longitudes
  aspects: Aspect[]
  ascendant: number // ASC longitude
  size?: number
  className?: string
}

// ── Geometry ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

/**
 * Convert ecliptic longitude to chart angle.
 * ASC is on the left (180° / π), zodiac runs counter-clockwise.
 */
function lonToAngle(longitude: number, asc: number): number {
  return -(longitude - asc) * DEG + Math.PI
}

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

/** SVG arc path for a sector from startAngle to endAngle */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToXY(cx, cy, r, startAngle)
  const end = polarToXY(cx, cy, r, endAngle)
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

// ── Radii (relative to viewBox 500) ─────────────────────────────────────

const CX = 250
const CY = 250
const R_OUTER = 230 // outer edge of zodiac ring
const R_ZODIAC_INNER = 190 // inner edge of zodiac ring
const R_HOUSE_NUM = 175 // house number labels
const R_PLANET = 155 // planet glyph ring
const R_ASPECT = 120 // aspect lines stay inside this
const R_CENTER = 40 // empty center

// ── Component ────────────────────────────────────────────────────────────

export const ChartWheel = memo(function ChartWheel({
  planets,
  houses,
  aspects,
  ascendant,
  size = 500,
  className,
}: ChartWheelProps) {
  // Build planet longitude map for aspect line positioning
  const planetMap = new Map<string, Planet>()
  for (const p of planets) planetMap.set(p.name, p)

  // Anti-collision: spread planets that are within 8° of each other
  const sortedPlanets = [...planets].sort((a, b) => a.longitude - b.longitude)
  const displayPlanets = sortedPlanets.map((p, i) => {
    let offset = 0
    for (let j = 0; j < i; j++) {
      const diff = Math.abs(p.longitude - sortedPlanets[j]!.longitude)
      if (diff < 8) offset += 12 // push outward
    }
    return { ...p, rOffset: offset }
  })

  return (
    <svg
      viewBox="0 0 500 500"
      width={size}
      height={size}
      className={className}
      style={{ background: 'transparent' }}
    >
      {/* Background */}
      <circle
        cx={CX}
        cy={CY}
        r={R_OUTER}
        fill="rgba(6, 9, 15, 0.8)"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
      />
      <circle
        cx={CX}
        cy={CY}
        r={R_ZODIAC_INNER}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={0.5}
      />
      <circle
        cx={CX}
        cy={CY}
        r={R_PLANET}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={0.5}
      />
      <circle
        cx={CX}
        cy={CY}
        r={R_CENTER}
        fill="rgba(6, 9, 15, 0.9)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.5}
      />

      {/* Zodiac Ring — 12 sign segments */}
      <g>
        {ZODIAC_SIGNS.map((sign, i) => {
          const startLon = i * 30
          const endLon = (i + 1) * 30
          const startAngle = lonToAngle(startLon, ascendant)
          const endAngle = lonToAngle(endLon, ascendant)
          const element = SIGN_ELEMENT[sign] ?? 'air'
          const colors = ELEMENT_COLORS[element]!
          const midAngle = (startAngle + endAngle) / 2
          const glyphPos = polarToXY(CX, CY, (R_OUTER + R_ZODIAC_INNER) / 2, midAngle)

          return (
            <g key={sign}>
              <path
                d={arcPath(CX, CY, R_OUTER, startAngle, endAngle)}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={0.5}
              />
              {/* Clip inner circle */}
              <path
                d={arcPath(CX, CY, R_ZODIAC_INNER, startAngle, endAngle)}
                fill="rgba(6, 9, 15, 0.85)"
                stroke="none"
              />
              {/* Sign glyph */}
              <text
                x={glyphPos.x}
                y={glyphPos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={colors.text}
                fontSize={14}
                fontFamily="serif"
                opacity={0.8}
              >
                {SIGN_GLYPHS[sign]}
              </text>
            </g>
          )
        })}
      </g>

      {/* House Lines */}
      <g>
        {houses.map((cuspLon, i) => {
          const angle = lonToAngle(cuspLon, ascendant)
          const inner = polarToXY(CX, CY, R_CENTER, angle)
          const outer = polarToXY(CX, CY, R_ZODIAC_INNER, angle)
          const isAngle = i === 0 || i === 3 || i === 6 || i === 9 // ASC, IC, DSC, MC
          const numPos = polarToXY(CX, CY, R_HOUSE_NUM, angle + 0.15)

          return (
            <g key={`house-${i}`}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={isAngle ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}
                strokeWidth={isAngle ? 1.5 : 0.5}
              />
              {/* House number */}
              <text
                x={numPos.x}
                y={numPos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255,255,255,0.25)"
                fontSize={9}
                fontFamily="monospace"
              >
                {i + 1}
              </text>
            </g>
          )
        })}
      </g>

      {/* ASC / MC / DSC / IC Labels */}
      {houses.length >= 10 && (
        <g>
          {[
            { label: 'ASC', lon: houses[0]!, offset: -16 },
            { label: 'IC', lon: houses[3]!, offset: -12 },
            { label: 'DSC', lon: houses[6]!, offset: -16 },
            { label: 'MC', lon: houses[9]!, offset: -12 },
          ].map(({ label, lon, offset }) => {
            const angle = lonToAngle(lon, ascendant)
            const pos = polarToXY(CX, CY, R_ZODIAC_INNER + offset, angle)
            return (
              <text
                key={label}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#00d4ff"
                fontSize={10}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {label}
              </text>
            )
          })}
        </g>
      )}

      {/* Aspect Lines */}
      <g>
        {aspects.map((asp, i) => {
          const p1 = planetMap.get(asp.planet1)
          const p2 = planetMap.get(asp.planet2)
          if (!p1 || !p2) return null
          const a1 = lonToAngle(p1.longitude, ascendant)
          const a2 = lonToAngle(p2.longitude, ascendant)
          const pos1 = polarToXY(CX, CY, R_ASPECT, a1)
          const pos2 = polarToXY(CX, CY, R_ASPECT, a2)
          const color = ASPECT_COLORS[asp.type] ?? 'rgba(255,255,255,0.15)'
          const dash = ASPECT_DASH[asp.type] ?? ''
          const opacity = Math.max(0.15, 0.6 - asp.orb * 0.06)

          return (
            <line
              key={`asp-${i}`}
              x1={pos1.x}
              y1={pos1.y}
              x2={pos2.x}
              y2={pos2.y}
              stroke={color}
              strokeWidth={0.8}
              strokeDasharray={dash}
              opacity={opacity}
            />
          )
        })}
      </g>

      {/* Planet Glyphs */}
      <g>
        {displayPlanets.map((p) => {
          const angle = lonToAngle(p.longitude, ascendant)
          const r = R_PLANET - p.rOffset
          const pos = polarToXY(CX, CY, r, angle)
          const glyph = PLANET_GLYPHS[p.name] ?? p.name.charAt(0)
          const color = PLANET_COLORS[p.name] ?? '#e2e8f0'

          return (
            <g key={p.name}>
              {/* Tick mark on zodiac ring */}
              <line
                x1={polarToXY(CX, CY, R_ZODIAC_INNER, angle).x}
                y1={polarToXY(CX, CY, R_ZODIAC_INNER, angle).y}
                x2={polarToXY(CX, CY, R_ZODIAC_INNER - 5, angle).x}
                y2={polarToXY(CX, CY, R_ZODIAC_INNER - 5, angle).y}
                stroke={color}
                strokeWidth={1}
                opacity={0.6}
              />
              {/* Planet glyph */}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize={13}
                fontFamily="serif"
              >
                {glyph}
              </text>
              {/* Retrograde marker */}
              {p.retrograde && (
                <text
                  x={pos.x + 8}
                  y={pos.y - 6}
                  fill="#ff3a5c"
                  fontSize={7}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  R
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
})
