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
<div className="mb-6">
  <h1 className="text-2xl font-orbitron text-neon-teal">Page Title</h1>
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
<span className="cyber-badge cyber-status-error">error</span>
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

Semantic status styling for badges:

```tsx
<span className="cyber-badge cyber-status-idle">idle</span>
<span className="cyber-badge cyber-status-executing">running</span>
<span className="cyber-badge cyber-status-error">error</span>
<span className="cyber-badge cyber-status-offline">offline</span>
<span className="cyber-badge cyber-status-warning">degraded</span>
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
          <span className="cyber-badge cyber-status-idle">idle</span>
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

| State     | Dot                           | Badge                    | Color  |
| --------- | ----------------------------- | ------------------------ | ------ |
| Idle      | `neon-dot-green`              | `cyber-status-idle`      | Green  |
| Executing | `neon-dot-blue animate-pulse` | `cyber-status-executing` | Blue   |
| Error     | `neon-dot-red`                | `cyber-status-error`     | Red    |
| Offline   | (no glow)                     | `cyber-status-offline`   | Slate  |
| Warning   | `neon-dot-yellow`             | `cyber-status-warning`   | Yellow |

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
| Neon shimmer  | `neon-shimmer`       | 2s       | Loading skeleton         |
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
| `src/components/db-error-banner.tsx`       | Standard error display component                                                  |
