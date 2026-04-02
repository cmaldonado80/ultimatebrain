# Solarc Brain — UI/UX Design Guidelines

The authoritative reference for building UI in the Solarc Brain dashboard.
Design system: **Dark Cosmic** — mission control for AI agents.
Stack: Next.js 15 + Tailwind CSS v4 + tRPC. All tokens live in `globals.css` `@theme` block.

---

## Quick Reference

| Intent           | Class                           |
| ---------------- | ------------------------------- |
| Card container   | `cyber-card`                    |
| Primary button   | `cyber-btn-primary`             |
| Secondary button | `cyber-btn-secondary`           |
| Danger button    | `cyber-btn-danger`              |
| Text input       | `cyber-input`                   |
| Select dropdown  | `cyber-select`                  |
| Inline badge     | `cyber-badge`                   |
| Status dot       | `neon-dot neon-dot-green`       |
| Card grid        | `cyber-grid`                    |
| Scrollable table | `cyber-table-scroll`            |
| Modal overlay    | `cyber-overlay` + `cyber-modal` |
| Heading font     | `font-orbitron` (auto on h1-h6) |
| Monospace        | `font-mono`                     |
| Page padding     | `p-6`                           |

---

## 1. Color System

### Neon Accents

| Token  | Hex       | Tailwind                            | Semantic Use                                               |
| ------ | --------- | ----------------------------------- | ---------------------------------------------------------- |
| Blue   | `#00d4ff` | `text-neon-blue`, `bg-neon-blue/20` | Primary action, links, active/executing state, focus rings |
| Teal   | `#00c4cc` | `text-neon-teal`, `bg-neon-teal/10` | Org context — OrgBadge, OrgSwitcher, org name labels       |
| Purple | `#8b5cf6` | `text-neon-purple`                  | Secondary accent, agent identity, crew mode, blockquotes   |
| Green  | `#00ff88` | `text-neon-green`                   | Success, healthy, idle agents, completed tasks             |
| Yellow | `#ffd200` | `text-neon-yellow`                  | Warning, degraded health, high priority                    |
| Red    | `#ff3a5c` | `text-neon-red`                     | Error, danger, destructive actions, critical priority      |

### Background Hierarchy (deepest → nearest)

```
bg-deep     (#06090f)  — body, deepest layer
bg-surface  (#0a0f1a)  — sidebar, topbar, structural chrome
bg-elevated (#111827)  — inputs, search bars, nested panels
bg-card     (white 3%) — glassmorphism card interiors
```

### Text Hierarchy

```
text-white     — headings, emphasis
text-slate-200 — body text (default)
text-slate-400 — secondary text, descriptions
text-slate-500 — tertiary text, placeholders, muted labels
text-slate-600 — metadata, timestamps, disabled text
```

### Borders

```
border      (white 8%)  — primary borders (cards, inputs, dividers)
border-dim  (white 4%)  — secondary borders (table rows, subtle dividers)
```

### Dynamic Colors — The Safe Pattern

Never interpolate Tailwind classes. This breaks purging:

```tsx
// BAD — Tailwind can't detect this at build time
<div className={`text-${color}`}>{value}</div>

// GOOD — use a static map
const COLORS: Record<string, string> = {
  'neon-blue': 'text-neon-blue',
  'neon-green': 'text-neon-green',
  'neon-red': 'text-neon-red',
}
<div className={COLORS[color]}>{value}</div>
```

---

## 2. Typography

### Font Families

| Family             | Class           | Use For                                                                  |
| ------------------ | --------------- | ------------------------------------------------------------------------ |
| **Orbitron**       | `font-orbitron` | Headings (auto-applied to h1-h6), page titles, brand text                |
| **Inter**          | (default)       | Body text, labels, descriptions, UI controls                             |
| **JetBrains Mono** | `font-mono`     | Code, IDs, model names, versions, timestamps, badges, keyboard shortcuts |

### Size Scale

| Purpose            | Class                   | Pixels |
| ------------------ | ----------------------- | ------ |
| Page title         | `text-2xl`              | 24px   |
| Section heading    | `text-sm font-orbitron` | 14px   |
| Body text          | `text-sm`               | 14px   |
| Small label        | `text-xs`               | 12px   |
| Micro text         | `text-[10px]`           | 10px   |
| Nano text (badges) | `text-[9px]`            | 9px    |

### Standard Page Header

```tsx
<div className="flex items-center gap-3 mb-6">
  <h1 className="text-xl font-orbitron text-white m-0">Page Title</h1>
  <OrgBadge />
  <p className="text-sm text-slate-400 mt-1">Subtitle description</p>
</div>
```

---

## 3. Components

### cyber-card

Glassmorphism panel with backdrop blur and hover glow. The foundational container.

```tsx
<div className="cyber-card p-4">
  <h3 className="text-sm font-orbitron text-white mb-3">Section Title</h3>
  {/* content */}
</div>
```

### Buttons

```tsx
<button className="cyber-btn-primary">Create</button>    {/* blue — main actions */}
<button className="cyber-btn-secondary">Cancel</button>   {/* neutral — alternatives */}
<button className="cyber-btn-danger">Delete</button>       {/* red — destructive */}
```

Button sizes: default is `px-4 py-2 text-sm`. For small buttons: `text-xs px-2 py-1`.

### cyber-badge

Inline metadata label. Combine with semantic color classes:

```tsx
<span className="cyber-badge text-neon-green">active</span>
<span className="cyber-badge bg-violet-500/20 text-violet-300">agent</span>
<span className="cyber-badge text-neon-red border-neon-red/20">error</span>
```

### Form Controls

```tsx
<input className="cyber-input" placeholder="Search..." />
<select className="cyber-select">
  <option>Option 1</option>
</select>
```

Both include: dark background, subtle border, neon-blue focus ring, placeholder styling.

### Modals

```tsx
<div className="cyber-overlay" onClick={onClose}>
  <div className="cyber-modal" onClick={(e) => e.stopPropagation()}>
    <h3 className="text-sm font-orbitron text-white mb-4">Confirm Action</h3>
    <p className="text-sm text-slate-400 mb-6">Are you sure?</p>
    <div className="flex gap-2 justify-end">
      <button className="cyber-btn-secondary" onClick={onClose}>
        Cancel
      </button>
      <button className="cyber-btn-danger" onClick={onConfirm}>
        Delete
      </button>
    </div>
  </div>
</div>
```

### Status Dots

Small glowing indicators. 8px diameter with matching color glow:

```tsx
<span className="neon-dot neon-dot-green" />   {/* healthy/idle */}
<span className="neon-dot neon-dot-blue" />    {/* active/executing */}
<span className="neon-dot neon-dot-red" />     {/* error */}
<span className="neon-dot neon-dot-yellow" />  {/* warning */}
<span className="neon-dot neon-dot-purple" />  {/* agent identity */}
```

Add `animate-pulse` or `neon-dot-pulse` for live/active states.

### Status Badges

Combine `cyber-badge` with semantic color classes:

```tsx
<span className="cyber-badge text-neon-green border-neon-green/20">idle</span>
<span className="cyber-badge text-neon-blue border-neon-blue/20">running</span>
<span className="cyber-badge text-neon-red border-neon-red/20">error</span>
<span className="cyber-badge text-slate-500 border-slate-500/20">offline</span>
<span className="cyber-badge text-neon-yellow border-neon-yellow/20">degraded</span>
```

### Grids

```tsx
{
  /* Auto-fill card grid (300px min columns) */
}
;<div className="cyber-grid">
  <div className="cyber-card p-4">Card 1</div>
  <div className="cyber-card p-4">Card 2</div>
</div>

{
  /* Stat cards (responsive columns) */
}
;<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{/* stat cards */}</div>

{
  /* Two-column layout */
}
;<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{/* left and right panels */}</div>
```

### Scrollable Tables

```tsx
<div className="cyber-table-scroll">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border-dim text-left text-xs text-slate-500 uppercase tracking-wider">
        <th className="pb-2 pr-4">Name</th>
        <th className="pb-2 pr-4">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border-dim/30 hover:bg-bg-elevated/50">
        <td className="py-2.5 pr-4 text-slate-200">Item</td>
        <td className="py-2.5 pr-4">
          <span className="cyber-badge text-neon-green border-neon-green/20">idle</span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 4. Layout

### App Shell Structure

```
┌──────────────────────────────────────────────┐
│ Topbar (h-16, bg-surface, backdrop-blur)     │
├──────────┬───────────────────────────────────┤
│ Sidebar  │ Main Content                      │
│ w-64     │ flex-1, overflow-y-auto           │
│ bg-      │ p-6                               │
│ surface  │                                   │
│          │                                   │
│ hidden   │                                   │
│ md:block │                                   │
└──────────┴───────────────────────────────────┘
```

- **Sidebar**: 256px wide, hidden below `md:` (768px), mobile hamburger overlay
- **Topbar**: 64px tall, sticky, glass effect with `backdrop-blur-xl`
- **Content**: `p-6` padding, scrollable

### Responsive Breakpoints

| Breakpoint | Width  | Key Changes                  |
| ---------- | ------ | ---------------------------- |
| `sm:`      | 640px  | Grid columns expand          |
| `md:`      | 768px  | Sidebar visible, topbar full |
| `lg:`      | 1024px | Two-column layouts           |

### Navigation Active State

```tsx
const isActive = (href: string) =>
  href === '/' || href === '/ops'
    ? pathname === href // exact match for root pages
    : pathname === href || pathname.startsWith(href + '/') // prefix match for sections
```

---

## 5. Page Patterns

### Standard Page Skeleton

Every page follows this structure:

```tsx
'use client'

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

export default function MyPage() {
  const dataQuery = trpc.myRouter.list.useQuery()
  const utils = trpc.useUtils()

  const deleteMut = trpc.myRouter.delete.useMutation({
    onSuccess: () => utils.myRouter.list.invalidate(),
    onError: (err) => {
      /* show error feedback */
    },
  })

  // Error state
  if (dataQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={dataQuery.error} />
      </div>
    )
  }

  // Loading state
  if (dataQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-lg font-orbitron text-slate-500">Loading...</div>
      </div>
    )
  }

  // Content
  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-orbitron text-neon-teal">Page Title</h1>
        <p className="text-sm text-slate-400 mt-1">Description</p>
      </div>

      {/* Content */}
    </div>
  )
}
```

### Empty State

```tsx
<div className="cyber-card p-8 text-center text-slate-500">
  No items found. Create one to get started.
</div>
```

### Action Feedback Banner

```tsx
{
  actionMsg && (
    <div className="cyber-card border-neon-teal/40 bg-neon-teal/5 px-4 py-2 text-sm text-neon-teal">
      {actionMsg}
    </div>
  )
}
```

---

## 6. Status & State Indicators

### Agent State Mapping

| State     | Dot                           | Badge              | Color  |
| --------- | ----------------------------- | ------------------ | ------ |
| Idle      | `neon-dot-green`              | `text-neon-green`  | Green  |
| Executing | `neon-dot-blue animate-pulse` | `text-neon-blue`   | Blue   |
| Error     | `neon-dot-red`                | `text-neon-red`    | Red    |
| Offline   | (no glow)                     | `text-slate-500`   | Slate  |
| Warning   | `neon-dot-yellow`             | `text-neon-yellow` | Yellow |

### Priority Mapping

| Priority | Color              |
| -------- | ------------------ |
| Critical | `text-neon-red`    |
| High     | `text-neon-yellow` |
| Medium   | `text-neon-blue`   |
| Low      | `text-slate-500`   |

### Health Mapping

| Health    | Color              | Dot               |
| --------- | ------------------ | ----------------- |
| Healthy   | `text-neon-green`  | `neon-dot-green`  |
| Degraded  | `text-neon-yellow` | `neon-dot-yellow` |
| Unhealthy | `text-neon-red`    | `neon-dot-red`    |

---

## 7. Accessibility

### Contrast

All neon colors on `bg-deep` (#06090f) exceed WCAG AA contrast ratios for normal text:

- Blue (#00d4ff): 10.3:1
- Green (#00ff88): 12.1:1
- Yellow (#ffd200): 12.8:1
- Red (#ff3a5c): 5.2:1 (AA for large text; pair with white for small text)

### Rules

- Avoid neon-colored text below 12px (`text-xs`). Use `text-slate-*` for micro text
- Every interactive element must have visible hover and focus states
- Use `aria-label` on icon-only buttons
- Never rely on color alone for status — always pair with text label or shape (dot + text)
- All form inputs have focus ring via `cyber-input` / `cyber-select` classes
- Animations respect `prefers-reduced-motion` (Tailwind's `motion-reduce:` modifier)

---

## 8. Animations

| Animation     | Class / Keyframe     | Duration | Use For                  |
| ------------- | -------------------- | -------- | ------------------------ |
| Neon pulse    | `neon-dot-pulse`     | 2s       | Active status dots       |
| Cursor blink  | `chat-cursor`        | 1s       | Streaming text cursor    |
| Thinking dots | `chat-thinking-dot`  | 1.2s     | Agent "typing" indicator |
| Avatar pulse  | `avatar-pulse`       | 2s       | Agent executing avatar   |
| Agent cursor  | `agent-cursor-pulse` | 2s       | Live cursor presence     |

All animations use `ease-in-out` or `step-end` timing. Keep animations subtle — they support UX, they don't distract.

---

## 9. DO and DON'T Rules

### DO

- Use `cyber-*` classes for all UI elements
- Handle both `error` and `isLoading` states for every tRPC query
- Add `onError` handlers to all mutations
- Use `utils.router.procedure.invalidate()` after successful mutations
- Use static color maps for dynamic Tailwind classes
- Put all custom CSS in `globals.css` `@layer components` or `@layer base`
- Use `text-sm` as the default body text size
- Use `p-6` as the standard page padding

### DON'T

- Never use inline `style={{}}` — use Tailwind utilities
- Never use `text-${variable}` or other interpolated class names
- Never add CSS files outside `globals.css`
- Never use `!important` overrides
- Never use raw `<input>` or `<select>` — use `cyber-input` / `cyber-select`
- Never use `<button>` without a `cyber-btn-*` class
- Never commit a page without error and loading states
- Never use color alone to convey meaning (accessibility)
- Never fetch more data than needed (avoid `limit: 500` for counts)

---

## 10. Chat UI System

The chat interface has its own component set:

| Class               | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `chat-sidebar`      | Session list panel (256px, collapsible to 40px)        |
| `chat-bubble-user`  | User message bubble (blue tint, right-aligned corner)  |
| `chat-bubble-agent` | Agent message bubble (card bg, left-aligned corner)    |
| `chat-agent-label`  | Agent name label (10px uppercase)                      |
| `chat-markdown`     | Markdown content wrapper (paragraphs, lists, headings) |
| `chat-code-block`   | Code block container with header                       |
| `chat-code-header`  | Language label + copy button row                       |
| `chat-inline-code`  | Inline code (blue text, dark bg)                       |
| `chat-cursor`       | Blinking cursor for streaming                          |
| `chat-thinking-dot` | Bouncing dots for "agent thinking"                     |
| `chat-link`         | Neon-blue underlined link                              |
| `chat-table`        | Compact table with borders                             |

Agent avatars use deterministic colors from a name hash:

```tsx
function agentColor(name: string): string {
  const colors = ['#00d4ff', '#8b5cf6', '#00ff88', '#ffd200', '#ff3a5c', '#f472b6', '#38bdf8']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
```

---

## File Reference

| File                                       | Contains                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/app/globals.css`                      | All design tokens (`@theme`), component classes (`@layer components`), animations |
| `src/app/layout.tsx`                       | Root layout, font imports, metadata, body classes                                 |
| `src/components/app-shell.tsx`             | Sidebar + topbar + mobile menu layout shell                                       |
| `src/components/layout/sidebar.tsx`        | Navigation links, spotlight search, `isActive()` logic                            |
| `src/components/layout/topbar.tsx`         | Health badge, breadcrumb, presence avatars                                        |
| `src/components/chat/markdown-message.tsx` | Markdown renderer with syntax highlighting                                        |

---

## 11. Pixel-Level Layout Spec

### Color Tokens — Complete Table

| Token name    | CSS var               | Hex / value              | Semantic use                                        |
| ------------- | --------------------- | ------------------------ | --------------------------------------------------- |
| `neon-blue`   | `--color-neon-blue`   | `#00d4ff`                | Primary action, links, focus rings, executing state |
| `neon-teal`   | `--color-neon-teal`   | `#00c4cc`                | Org context (OrgBadge, OrgSwitcher, org name label) |
| `neon-purple` | `--color-neon-purple` | `#8b5cf6`                | AI/agent identity, crew mode, blockquotes           |
| `neon-green`  | `--color-neon-green`  | `#00ff88`                | Success, healthy, idle, completed                   |
| `neon-yellow` | `--color-neon-yellow` | `#ffd200`                | Warning, degraded, high priority                    |
| `neon-red`    | `--color-neon-red`    | `#ff3a5c`                | Error, danger, destructive, critical                |
| `bg-deep`     | `--color-bg-deep`     | `#06090f`                | Body background                                     |
| `bg-surface`  | `--color-bg-surface`  | `#0a0f1a`                | Sidebar, topbar chrome                              |
| `bg-elevated` | `--color-bg-elevated` | `#111827`                | Inputs, search bars, nested panels                  |
| `bg-card`     | `--color-bg-card`     | `rgba(255,255,255,0.03)` | Glassmorphism card interiors                        |
| `border`      | `--color-border`      | `rgba(255,255,255,0.08)` | Card and input borders                              |
| `border-dim`  | `--color-border-dim`  | `rgba(255,255,255,0.04)` | Table row separators                                |

### App Shell Exact Dimensions

```
┌─────────────────────────────────────────────────────┐
│  Sidebar 256px (w-64)  │  Main content area (flex-1) │
│  bg-bg-surface         │  bg-bg-deep                 │
│  border-r border-border│  overflow-y-auto            │
│                        │  padding: p-6 (24px)        │
│  hidden below md:768px │  max-w-5xl on data pages    │
│  mobile: overlay w-64  │  max-w-none on dashboards   │
└─────────────────────────────────────────────────────┘

Topbar: h-16 (64px), bg-bg-surface, border-b border-border, sticky
Body: bg-bg-deep + radial gradients (fixed attachment)
Mobile topbar: h-14 (56px), hamburger + brand text only
Scrollbar: 6px width, bg-white/10 thumb rounded-full
```

### Sidebar Pixel Spec

| Element        | Classes                                                                                          | Dimensions  |
| -------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| Root `<aside>` | `w-64 h-full bg-bg-surface border-r border-border flex flex-col px-3 py-4`                       | 256×100vh   |
| Logo zone      | `px-2 mb-5`, icon `text-lg`, text `font-orbitron text-[14px] font-bold tracking-widest`          | ~44px tall  |
| Diamond icon   | `text-neon-blue text-lg` — `◆`                                                                   | 18px        |
| Org name label | `text-[10px] text-neon-teal/50 mt-1 truncate ml-7`                                               | 10px        |
| Search button  | `px-3 py-2 mb-4 bg-bg-elevated border border-border rounded-lg text-sm text-slate-500`           | ~36px tall  |
| Kbd badge      | `text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono text-slate-600`   | 20px tall   |
| Section header | `text-[10px] font-mono font-bold uppercase tracking-widest text-white/20 px-2 pt-4 pb-1.5`       | ~28px tall  |
| Nav item       | `.nav-item` = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400`              | 36px tall   |
| Nav icon       | `w-[18px] text-center text-xs opacity-70 flex-shrink-0`                                          | 18px        |
| Active item    | `.nav-item-active` = `bg-neon-blue/10 text-neon-blue border-l-2 border-neon-blue rounded-l-none` | same height |

### Topbar Pixel Spec

Height: `h-16` (64px). Root: `bg-bg-surface border-b border-border`.

| Zone   | Position                         | Contents                                                                                                                      |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Left   | `flex items-center gap-2 flex-1` | Breadcrumb: segments in `text-xs text-slate-500`, current segment `text-white font-medium`, separator `/` in `text-slate-700` |
| Center | `flex-1` spacer                  | Empty                                                                                                                         |
| Right  | `flex items-center gap-3 px-6`   | HealthBadge → divider `w-px h-4 bg-border` → PresenceAvatars → divider → OrgSwitcher → UserMenu                               |

**HealthBadge:** `neon-dot` 8px + `text-[11px]` text, green dot when ok, red when unhealthy.

**PresenceAvatars:** 28px circles (`w-7 h-7`), `-ml-2` overlap, max 5 shown, `rounded-full border border-border`.

**OrgSwitcher pill:** `h-7 px-2.5 rounded-lg bg-neon-teal/5 border border-neon-teal/20 text-xs text-neon-teal`, max-w `120px` for org name, dropdown: `w-56 bg-bg-surface border border-border rounded-lg shadow-lg`.

**UserMenu:** `w-8 h-8 rounded-full` avatar, click → dropdown.

### Page Header Canonical Pattern

Every page must use this structure:

```tsx
<div className="flex items-center gap-3 mb-6">
  <h1 className="text-xl font-orbitron text-white m-0">{title}</h1>
  <OrgBadge />
  {/* optional: count */}
  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500 font-mono">
    {count}
  </span>
  {/* optional: live dot */}
  <span className="neon-dot neon-dot-green neon-dot-pulse" />
  {/* actions pushed to the right, operator-gated */}
  <div className="ml-auto flex items-center gap-2">
    <PermissionGate require="operator">
      <button className="cyber-btn-primary cyber-btn-sm">Action</button>
    </PermissionGate>
  </div>
</div>
```

**OrgBadge:** `text-[10px] px-2 py-0.5 rounded bg-neon-teal/10 text-neon-teal border border-neon-teal/20 font-medium`

### Card Variant System

All variants extend `.cyber-card` (`bg-bg-card border border-border rounded-xl backdrop-blur-md transition-all duration-300`):

| Variant          | Additional classes                                           | Use                     |
| ---------------- | ------------------------------------------------------------ | ----------------------- |
| **Standard**     | _(none)_                                                     | Default data panel      |
| **Highlighted**  | `border-neon-blue/30 shadow-[0_0_20px_rgba(0,212,255,0.05)]` | Selected / active state |
| **Warning**      | `border-neon-yellow/30 bg-neon-yellow/[0.02]`                | Degraded / caution      |
| **Error**        | `border-neon-red/30 bg-neon-red/[0.02]`                      | Critical / failed       |
| **Intelligence** | `border-neon-purple/30 bg-neon-purple/[0.02]`                | AI / ML content         |
| **Empty state**  | `p-8 text-center text-slate-500 text-sm`                     | No data                 |

**Stat card pattern:**

```tsx
<div className="cyber-card p-4">
  <div className="text-2xl font-bold font-orbitron text-neon-blue">{value}</div>
  <div className="text-xs text-slate-400 mt-1">{label}</div>
  <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>
</div>
```

### Core Page Layout Specs

**Mission Control (`/`):**

```
p-6 max-w-none
├── Header: flex justify-between mb-6
│   ├── h2 text-2xl font-orbitron + OrgBadge + subtitle text-xs text-slate-500
│   └── right: neon-dot-green animate-pulse + "Live" text + time-of-day badge
├── Stats: grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6
├── Agents at work (conditional): grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6
├── Live + Completed: grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6
└── Recommended panels: grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3
```

**Runtimes (`/runtimes`):**

```
p-6 max-w-5xl mx-auto
├── Header: flex gap-3 mb-6
├── Filter pills: flex gap-1.5 mb-4, pill: text-[10px] px-2.5 py-1 rounded
├── Runtime cards: space-y-2 or cyber-grid
│   └── cyber-card p-4 flex items-start gap-3
│       ├── neon-dot status indicator
│       ├── Name + version + model (text-sm / text-xs / text-[10px] font-mono)
│       └── Actions (PermissionGate require="operator"): cyber-btn-sm buttons
└── Empty state: cyber-card empty variant
```

**Incidents (`/ops/incidents`):**

```
p-6 max-w-5xl mx-auto
├── Header: flex items-center gap-3 mb-6 (includes active count badge)
├── Filters: flex gap-1.5 mb-4
└── Accordion list: space-y-2
    └── cyber-card border-{severity} p-3
        ├── Row: w-2.5 h-2.5 dot + serviceName + status-badge + severity text + timestamp + chevron
        └── Expanded: border-t border-border-dim pt-2 px-3 pb-3
            └── PermissionGate require="operator": ack + resolve buttons
```

**Workspace Detail (`/workspaces/[id]`):**

```
p-6 max-w-4xl mx-auto
├── Header: flex gap-3 mb-4
│   ├── Name (text-xl font-orbitron) + status dot + OrgBadge
│   └── Edit button (PermissionGate require="operator")
├── Tab bar: flex gap-1 border-b border-border mb-6
│   └── Tab: text-[11px] px-3 py-2 -mb-px, active: border-b-2 border-neon-blue text-neon-blue
└── Tab content panels
```

**Org Dashboard (`/org/dashboard`):**

```
p-6 max-w-5xl mx-auto
├── Header: h2 + OrgBadge + settings link
├── Stats row: grid grid-cols-4 gap-3 mb-6
│   └── 4× StatCard: members / runtimes / workspaces / active incidents
├── Two-column: grid grid-cols-3 gap-4
│   ├── Left (col-span-2): recent members + quick actions (grid-cols-2 gap-2)
│   └── Right (col-span-1): recent incidents + recent audit events
└── Settings link: text-xs text-neon-teal (admin+ only, via PermissionGate)
```

**Builder (`/builder`):**

```
flex h-full (no p-6 — full bleed)
├── Step list: w-72 flex-col bg-bg-surface border-r border-border p-3 overflow-y-auto
│   └── Step item: cyber-card p-3 cursor-pointer mb-2
│       selected: border-neon-blue/30 shadow glow
└── Canvas: flex-1 bg-bg-elevated/50 relative
    └── Code/config area: rounded-xl border border-border p-4
```

### Interaction State Reference

| State              | CSS treatment                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Hover (card)       | `hover:border-neon-blue/30 hover:shadow-[0_0_20px_rgba(0,212,255,0.05)]`                 |
| Hover (nav item)   | `hover:bg-white/5 hover:text-slate-100`                                                  |
| Hover (button)     | `hover:bg-neon-blue/30` (primary), `hover:bg-white/10` (secondary)                       |
| Focus              | `focus:outline-none focus:border-neon-blue/50 focus:ring-1 focus:ring-neon-blue/30`      |
| Active/pressed     | `active:scale-[0.98]` — add to interactive cards                                         |
| Disabled           | `opacity-40 cursor-not-allowed pointer-events-none`                                      |
| Loading page       | `flex items-center justify-center min-h-[60vh]` + `text-lg font-orbitron text-slate-500` |
| Loading inline     | `neon-dot neon-dot-pulse` or `animate-pulse` skeleton div                                |
| Success flash      | `border-neon-green/50 bg-neon-green/5` (500ms via state timeout)                         |
| Error flash        | `border-neon-red/50 bg-neon-red/5` + error text below input                              |
| Copied state       | Replace button text with "Copied!" for 2s, then restore                                  |
| Selected row       | `bg-neon-blue/5` row background                                                          |
| Expanded accordion | `border-t border-border-dim` separator + padding reveal                                  |

### Astrology App Token Alignment

File: `apps/astrology-app/src/app/globals.css`

Currently only has base font/color — add these tokens to align with main app:

```css
@import 'tailwindcss';

@theme {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-orbitron: 'Orbitron', sans-serif;

  --color-neon-blue: #00d4ff;
  --color-neon-teal: #00c4cc;
  --color-neon-purple: #8b5cf6;
  --color-neon-green: #00ff88;
  --color-neon-yellow: #ffd200;
  --color-neon-red: #ff3a5c;

  --color-bg-deep: #06090f;
  --color-bg-surface: #0a0f1a;
  --color-bg-elevated: #111827;
  --color-bg-card: rgba(255, 255, 255, 0.03);
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-dim: rgba(255, 255, 255, 0.04);
}
```

Unique astrology UI elements:

- **Constellation canvas:** `bg-bg-deep` + neon-purple/blue star points, `canvas` element full-bleed
- **Planet badges:** 32px circles, each planet gets a distinct neon color, label `text-[10px] font-mono` below
- **Transit timeline:** horizontal scroll `flex overflow-x-auto gap-4 py-3 bg-bg-surface`, each event a `cyber-card p-2 flex-shrink-0 w-40`
- **Aspect table:** use `.chat-table` class pattern (same text-xs border-collapse styling)

### Implementation Priorities

**P0 — Already done:**

- `--color-neon-teal: #00c4cc` added to `globals.css` `@theme` block

**P1 — Visual consistency (do next):**

- Canonicalize page headers: every page header must use `flex items-center gap-3 mb-6` + `<OrgBadge />`
- Standardize button sizes: use `.cyber-btn-sm` for in-card actions, `.cyber-btn-xs` for table cell actions
- Apply card variants: replace inline `border border-neon-red/30` etc. with semantic variant classes

**P2 — Polish:**

- Sidebar section header spacing: ensure `pt-4 pb-1.5` on all section labels (already in code)
- Topbar right-zone dividers: add `w-px h-4 bg-border` separators between topbar elements
- Empty state components: use consistent empty state pattern across all list pages

**P3 — Astrology unification:**

- Copy token block above to `apps/astrology-app/src/app/globals.css`
- Apply `font-orbitron` to astrology page headings
- Use `cyber-card` for astrology panels
  | `src/components/db-error-banner.tsx` | Standard error display component |
