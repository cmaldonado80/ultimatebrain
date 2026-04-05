# DESIGN.md — Solarc Brain Visual System

> AI-readable design specification for the Ultimate Brain platform.
> Copy this file into any project root so AI agents generate UI consistent with the Solarc aesthetic.

---

## 1. Visual Theme & Atmosphere

**Mood:** Deep space command center. Dark, precise, alive with subtle energy.

The interface feels like a control room for autonomous AI systems — dark backgrounds with neon accents that pulse when systems are active. Glassmorphism panels float over cosmic ambient gradients. Every surface is subtly transparent. Color is used sparingly and always carries meaning (blue = active, green = healthy, red = critical, purple = intelligence).

**Key principles:**

- Dark-first. No light mode. The darkness is the brand.
- Neon color is signal, not decoration. If it glows, it means something.
- Glassmorphism over flat surfaces — `backdrop-blur-md` with 3% white backgrounds.
- Cosmic ambient blobs in the background (blue top, purple bottom-left, fixed position).
- Headings use Orbitron (geometric, futuristic). Body uses Inter (clean, readable). Code uses JetBrains Mono.

---

## 2. Color Palette & Roles

### Neon Accent Colors (semantic — each has a meaning)

| Token         | Hex       | Role                                                |
| ------------- | --------- | --------------------------------------------------- |
| `neon-blue`   | `#00d4ff` | Primary action, active state, links, selected items |
| `neon-teal`   | `#00c4cc` | Secondary accent, alternative highlights            |
| `neon-purple` | `#8b5cf6` | Intelligence, AI features, astrology domain         |
| `neon-green`  | `#00ff88` | Success, healthy, online, completed                 |
| `neon-yellow` | `#ffd200` | Warning, pending, in-progress                       |
| `neon-red`    | `#ff3a5c` | Error, critical, failed, destructive actions        |

### Background Layers (depth hierarchy)

| Token         | Value                    | Usage                                  |
| ------------- | ------------------------ | -------------------------------------- |
| `bg-deep`     | `#06090f`                | Body background — deepest layer        |
| `bg-surface`  | `#0a0f1a`                | Sidebar, topbar, panels                |
| `bg-elevated` | `#111827`                | Inputs, search bars, modals, dropdowns |
| `bg-card`     | `rgba(255,255,255,0.03)` | Glassmorphism cards and panels         |

### Borders

| Token        | Value                    | Usage                              |
| ------------ | ------------------------ | ---------------------------------- |
| `border`     | `rgba(255,255,255,0.08)` | Standard borders (cards, dividers) |
| `border-dim` | `rgba(255,255,255,0.04)` | Subtle table row borders           |

### Text Colors (Tailwind Slate scale)

| Class            | Usage                                     |
| ---------------- | ----------------------------------------- |
| `text-white`     | Headings, important values, active labels |
| `text-slate-100` | Input text, primary body content          |
| `text-slate-200` | Default body text                         |
| `text-slate-300` | Secondary button text                     |
| `text-slate-400` | Labels, nav items, meta text              |
| `text-slate-500` | Placeholder text, timestamps              |
| `text-slate-600` | Disabled text, tertiary labels            |

---

## 3. Typography Rules

| Element                  | Font           | Weight  | Size                | Tracking       |
| ------------------------ | -------------- | ------- | ------------------- | -------------- |
| Display headings (h1-h2) | Orbitron       | 700-900 | text-lg to text-2xl | tracking-tight |
| Section headings (h3)    | Orbitron       | 500     | text-sm             | tracking-tight |
| Body text                | Inter          | 400     | text-sm (14px)      | normal         |
| Labels & meta            | Inter          | 500     | text-xs (12px)      | normal         |
| Micro text               | Inter          | 400     | text-[10px]         | normal         |
| Stat values              | Orbitron       | 700     | text-2xl            | normal         |
| Code & data              | JetBrains Mono | 400-500 | text-xs             | normal         |
| Badges                   | JetBrains Mono | 500     | text-xs             | normal         |

**Loading fonts:**

```
Inter:wght@400;500;600
JetBrains Mono:wght@400;500;700
Orbitron:wght@500;700;900
```

---

## 4. Component Styles

### Cards (`cyber-card`)

- Background: `bg-card` (3% white with backdrop-blur-md)
- Border: `border border-border` (8% white)
- Radius: `rounded-xl` (12px)
- Hover: border shifts to `neon-blue/30`, faint blue glow shadow
- Variants: `highlighted` (blue border), `warning` (yellow), `error` (red), `intelligence` (purple)

### Buttons

| Variant   | Background     | Text        | Border         | Hover             |
| --------- | -------------- | ----------- | -------------- | ----------------- |
| Primary   | `neon-blue/20` | `neon-blue` | `neon-blue/30` | `neon-blue/30` bg |
| Secondary | `white/5`      | `slate-300` | `white/10`     | `white/10` bg     |
| Danger    | `neon-red/10`  | `neon-red`  | `neon-red/30`  | `neon-red/20` bg  |

All buttons: `rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150`
Size variants: `cyber-btn-sm` (text-xs px-2.5 py-1), `cyber-btn-xs` (text-[10px] px-2 py-0.5)
Disabled: `opacity-40 cursor-not-allowed`

### Inputs & Selects (`cyber-input`, `cyber-select`)

- Background: `bg-elevated` (#111827)
- Text: `slate-100`
- Border: `white/10`, focus: `neon-blue/50` with `ring-1 ring-neon-blue/30`
- Radius: `rounded-lg`
- Padding: `px-3 py-2 text-sm`
- Placeholder: `slate-500`

### Badges (`cyber-badge`)

- Background: `white/5` with `border white/10`
- Text: `text-xs font-mono font-medium`
- Padding: `px-2 py-0.5 rounded`

### Status Badge

- Colored background at 10% opacity + matching border at 20% + text in full neon color
- Optional animated dot (w-2 h-2 rounded-full with pulse animation)
- Size: `text-[9px] px-1.5 py-0.5`

### Status Dots (`neon-dot`)

- Size: `w-2 h-2 rounded-full`
- Each color has a matching `box-shadow: 0 0 8px {color}` glow
- Pulse animation available via `neon-dot-pulse`

### Modals (`cyber-overlay` + `cyber-modal`)

- Overlay: `bg-black/60 backdrop-blur-sm`
- Modal: glassmorphism card, `w-[400px] max-w-[90vw]`, heavy shadow
- `shadow-[0_20px_60px_rgba(0,0,0,0.6)]`

### Navigation Item (`nav-item`)

- Default: `text-slate-400`, hover: `bg-white/5 text-slate-100`
- Active: `bg-neon-blue/10 text-neon-blue` with left border accent

---

## 5. Layout Principles

### Spacing Scale (Tailwind defaults)

| Token   | Value | Usage                             |
| ------- | ----- | --------------------------------- |
| `gap-2` | 8px   | Tight grids (badges, small cards) |
| `gap-3` | 12px  | Standard grid gaps, card grids    |
| `gap-4` | 16px  | Section spacing                   |
| `gap-6` | 24px  | Major section gaps                |
| `p-3`   | 12px  | Small card padding                |
| `p-4`   | 16px  | Standard card padding             |
| `p-6`   | 24px  | Large card / modal padding        |
| `mb-3`  | 12px  | Below section titles              |
| `mb-5`  | 20px  | Below card grids                  |
| `mb-6`  | 24px  | Between major sections            |

### Grid System (`PageGrid` component)

| Cols | Classes                                                          |
| ---- | ---------------------------------------------------------------- |
| 2    | `grid-cols-1 lg:grid-cols-2`                                     |
| 3    | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`                      |
| 4    | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`       |
| 6    | `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6`       |
| auto | `grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]` |

### App Shell

- Sidebar: `w-64` fixed left, hidden on mobile (hamburger menu triggers overlay drawer)
- Topbar: full width, hidden on mobile (replaced by hamburger bar with logo)
- Main content: `flex-1 overflow-y-auto overflow-x-hidden`

---

## 6. Depth & Elevation

| Level | Surface                        | Shadow                                 | Usage             |
| ----- | ------------------------------ | -------------------------------------- | ----------------- |
| 0     | `bg-deep`                      | none                                   | Page background   |
| 1     | `bg-surface`                   | none                                   | Sidebar, topbar   |
| 2     | `bg-elevated`                  | none                                   | Inputs, search    |
| 3     | `bg-card` + `backdrop-blur-md` | none (border glow on hover)            | Cards, panels     |
| 4     | `bg-card`                      | `shadow-[0_20px_60px_rgba(0,0,0,0.6)]` | Modals, dropdowns |

**Ambient background blobs (body):**

```css
radial-gradient(circle at 50% -20%, rgba(0,212,255,0.05), transparent 40%),
radial-gradient(circle at 0% 100%, rgba(139,92,246,0.03), transparent 30%)
background-attachment: fixed;
```

---

## 7. Design Guidelines

### Do

- Use neon colors only for status and interactive elements
- Keep text at `text-sm` (14px) for body, `text-xs` (12px) for labels
- Use `cyber-card` for all data containers
- Use Orbitron only for headings and stat values
- Use `font-mono` for data values, IDs, timestamps, badges
- Add responsive breakpoints to all grids (never hardcode `grid-cols-N` without `sm:/md:/lg:`)
- Wrap tables in `overflow-x-auto` for mobile

### Don't

- Don't use light backgrounds or white surfaces
- Don't use more than 2 neon colors on the same card
- Don't use Orbitron for body text or paragraphs
- Don't use `text-white` for body text (use `text-slate-200`)
- Don't expose error.message to users (show generic messages + reference ID)
- Don't add fixed pixel widths without `max-w-[90vw]` for mobile safety
- Don't use `opacity-0` to hide content (use `hidden` or conditional rendering)

---

## 8. Responsive Behavior

### Breakpoints (Tailwind defaults)

| Prefix | Min-width | Target                      |
| ------ | --------- | --------------------------- |
| (none) | 0px       | Mobile phones (375-639px)   |
| `sm:`  | 640px     | Large phones, small tablets |
| `md:`  | 768px     | Tablets                     |
| `lg:`  | 1024px    | Desktop                     |
| `xl:`  | 1280px    | Large desktop               |

### Adaptive Strategies

- **Sidebar:** `hidden md:block` — mobile gets hamburger menu + overlay drawer
- **Topbar:** `hidden md:block` — mobile gets minimal bar with logo + hamburger
- **Grids:** Always start at `grid-cols-1` and add columns at breakpoints
- **Tables:** Wrap in `cyber-table-scroll` (overflow-x-auto with negative margins)
- **Modals:** `w-full max-w-[400px]` — never fixed width without max-w
- **Chat sidebar:** `hidden md:flex` — mobile is chat-only, no sidebar

---

## 9. Agent Prompt Guide

When generating UI for Solarc Brain, use these quick references:

```
Background:     bg-bg-deep (#06090f) or bg-bg-surface (#0a0f1a)
Cards:          cyber-card class (glassmorphism, rounded-xl, border-border)
Primary button: cyber-btn-primary (neon blue ghost button)
Text:           text-slate-200 (body), text-white (headings)
Accent:         text-neon-blue (#00d4ff) for links and active states
Success:        text-neon-green (#00ff88) + neon-dot-green
Warning:        text-neon-yellow (#ffd200) + neon-dot-yellow
Error:          text-neon-red (#ff3a5c) + cyber-btn-danger
Intelligence:   text-neon-purple (#8b5cf6) for AI/analysis features
Heading font:   font-orbitron
Code font:      font-mono (JetBrains Mono)
Input:          cyber-input class
Badge:          cyber-badge class
Grid:           Use PageGrid component or responsive grid-cols-1 sm:X md:Y lg:Z
```

**Color palette for agent prompts:**

- Primary: `#00d4ff` (electric cyan)
- Secondary: `#8b5cf6` (vivid purple)
- Success: `#00ff88` (neon green)
- Warning: `#ffd200` (bright yellow)
- Danger: `#ff3a5c` (hot pink-red)
- Background: `#06090f` → `#0a0f1a` → `#111827` (three-layer depth)
- Text: `#e2e8f0` (slate-200, body) / `#ffffff` (headings)
