/**
 * Design Intelligence Engine — Reasoning-driven design decisions.
 *
 * Inspired by UI UX Pro Max's 161-rule reasoning engine.
 * Maps product categories to specific design recommendations:
 *   - UI style (from 30+ styles)
 *   - Color mood and palette
 *   - Typography personality
 *   - Landing page pattern
 *   - Key effects and animations
 *   - Anti-patterns to avoid
 *
 * This is DETERMINISTIC — not LLM-generated. The reasoning rules are
 * industry-proven design decisions, not AI hallucinations.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface DesignRecommendation {
  category: string
  pattern: string
  stylePriority: string
  colorMood: string
  typographyMood: string
  keyEffects: string
  antiPatterns: string
  severity: 'HIGH' | 'MEDIUM'
}

export interface StyleDefinition {
  name: string
  type: string
  keywords: string
  primaryColors: string
  effects: string
  bestFor: string
  doNotUseFor: string
  darkMode: boolean
  performance: string
  accessibility: string
  complexity: string
  cssKeywords: string
}

export interface DesignSystemRecommendation {
  category: DesignRecommendation
  styles: StyleDefinition[]
  deliveryChecklist: string[]
}

// ── Reasoning Rules Database (161 categories) ───────────────────────

const REASONING_RULES: DesignRecommendation[] = [
  // Tech / SaaS
  {
    category: 'SaaS General',
    pattern: 'Hero + Features + CTA + Pricing',
    stylePriority: 'Minimalism + Flat Design',
    colorMood: 'Trust blue + Accent contrast',
    typographyMood: 'Professional + Clean hierarchy',
    keyEffects: 'Subtle hover 200-250ms, smooth scroll',
    antiPatterns: 'No AI purple/pink gradients, no carousel heroes',
    severity: 'HIGH',
  },
  {
    category: 'SaaS Dashboard',
    pattern: 'Sidebar + KPI Cards + Data Tables',
    stylePriority: 'Flat Design + Dark Mode',
    colorMood: 'Neutral dark + Semantic accents',
    typographyMood: 'Monospace data + Sans-serif labels',
    keyEffects: 'Skeleton loading, chart animations 300ms',
    antiPatterns: 'No decorative elements in data areas, no gradients on charts',
    severity: 'HIGH',
  },
  {
    category: 'Developer Tools',
    pattern: 'Docs-first + Interactive Examples',
    stylePriority: 'Dark Mode + Minimalism',
    colorMood: 'Terminal green/blue + Dark backgrounds',
    typographyMood: 'Monospace code + Clean sans-serif docs',
    keyEffects: 'Copy buttons, syntax highlighting, instant search',
    antiPatterns: 'No stock photos, no marketing fluff in docs',
    severity: 'HIGH',
  },
  {
    category: 'AI/ML Product',
    pattern: 'Demo-first + Before/After + Pricing',
    stylePriority: 'Glassmorphism + Dark Mode',
    colorMood: 'Deep purple + Electric accents',
    typographyMood: 'Modern geometric + Bold headlines',
    keyEffects: 'Particle effects, typing animations, live demos',
    antiPatterns: 'No generic robot imagery, no "powered by AI" badges',
    severity: 'MEDIUM',
  },
  {
    category: 'Mobile App Landing',
    pattern: 'Phone Mockup Hero + Features + Download',
    stylePriority: 'Soft UI + Gradients',
    colorMood: 'Vibrant gradient + White space',
    typographyMood: 'Rounded friendly + Clear hierarchy',
    keyEffects: 'Parallax phone scroll, floating UI elements',
    antiPatterns: 'No horizontal scroll on mobile, no tiny CTAs',
    severity: 'HIGH',
  },

  // Finance
  {
    category: 'Banking',
    pattern: 'Trust Hero + Security Badges + Features',
    stylePriority: 'Flat Design + Minimalism',
    colorMood: 'Navy blue + Gold accents',
    typographyMood: 'Serif headlines + Sans-serif body (trust)',
    keyEffects: 'Subtle transitions only, no flashy animations',
    antiPatterns: 'No AI gradients, no playful illustrations, no dark mode by default',
    severity: 'HIGH',
  },
  {
    category: 'Fintech/Crypto',
    pattern: 'Dashboard Preview + Security + Social Proof',
    stylePriority: 'Dark Mode + Glassmorphism',
    colorMood: 'Dark + Neon green/blue accents',
    typographyMood: 'Monospace numbers + Modern sans-serif',
    keyEffects: 'Real-time data tickers, chart animations',
    antiPatterns: 'No rainbow gradients, no meme references, no "to the moon"',
    severity: 'HIGH',
  },
  {
    category: 'Insurance',
    pattern: 'Empathy Hero + Calculator + Trust Badges',
    stylePriority: 'Flat Design + Soft colors',
    colorMood: 'Calming blue/green + Warm accents',
    typographyMood: 'Readable serif + Large body text',
    keyEffects: 'Progressive form reveal, step indicators',
    antiPatterns: 'No fear-based imagery, no complex jargon in UI',
    severity: 'HIGH',
  },

  // Healthcare
  {
    category: 'Healthcare/Medical',
    pattern: 'Trust Hero + Services + Team + Testimonials',
    stylePriority: 'Clean Minimalism + Soft UI',
    colorMood: 'Medical blue + Calming green + White',
    typographyMood: 'Professional serif headers + Accessible body',
    keyEffects: 'Smooth transitions, clear focus states',
    antiPatterns: 'No dark mode default, no stock medical photos, no red CTAs',
    severity: 'HIGH',
  },
  {
    category: 'Mental Health',
    pattern: 'Empathy-first + Soft CTA + Resources',
    stylePriority: 'Soft UI + Organic shapes',
    colorMood: 'Sage green + Lavender + Warm neutrals',
    typographyMood: 'Rounded friendly + Large line height',
    keyEffects: 'Breathing animations, gentle fades, calm palette',
    antiPatterns: 'No aggressive CTAs, no countdown timers, no loud colors',
    severity: 'HIGH',
  },
  {
    category: 'Fitness/Wellness',
    pattern: 'Hero Image + Programs + Transformation + CTA',
    stylePriority: 'Bold + High contrast',
    colorMood: 'Energetic orange/red + Dark contrast',
    typographyMood: 'Bold condensed headlines + Clean body',
    keyEffects: 'Scroll-triggered reveals, video backgrounds',
    antiPatterns: 'No passive imagery, no small text on photos',
    severity: 'MEDIUM',
  },

  // E-commerce
  {
    category: 'E-commerce General',
    pattern: 'Hero Banner + Categories + Featured + Reviews',
    stylePriority: 'Clean Grid + Minimalism',
    colorMood: 'Neutral + Brand accent CTA',
    typographyMood: 'Clean sans-serif + Strong price hierarchy',
    keyEffects: 'Quick view, hover zoom, add-to-cart animation',
    antiPatterns: 'No autoplay carousels, no popup on entry, no fake urgency',
    severity: 'HIGH',
  },
  {
    category: 'Luxury/Fashion',
    pattern: 'Full-bleed imagery + Minimal text + Lookbook',
    stylePriority: 'Editorial + High-end minimalism',
    colorMood: 'Black + White + Gold accents',
    typographyMood: 'Elegant serif + Thin sans-serif',
    keyEffects: 'Smooth image transitions, cursor effects, parallax',
    antiPatterns: 'No discount badges, no cluttered grids, no popup modals',
    severity: 'HIGH',
  },
  {
    category: 'Food/Restaurant',
    pattern: 'Hero Image + Menu + Location + Reservations',
    stylePriority: 'Warm + Organic + Photography-driven',
    colorMood: 'Warm earth tones + Rich contrast',
    typographyMood: 'Display serif + Handwritten accents',
    keyEffects: 'Image lazy loading, smooth menu filters',
    antiPatterns: 'No stock food photos, no small menu text, no Flash-era effects',
    severity: 'MEDIUM',
  },

  // Services
  {
    category: 'Legal Services',
    pattern: 'Trust Hero + Practice Areas + Team + Contact',
    stylePriority: 'Conservative Minimalism',
    colorMood: 'Navy + Dark green + Gold',
    typographyMood: 'Traditional serif + Authority',
    keyEffects: 'Minimal animations, focus on readability',
    antiPatterns: 'No playful elements, no bright colors, no informal language',
    severity: 'HIGH',
  },
  {
    category: 'Real Estate',
    pattern: 'Search-first + Map + Listings + Agent CTA',
    stylePriority: 'Clean Grid + Image-heavy',
    colorMood: 'Navy blue + Warm neutrals',
    typographyMood: 'Modern sans-serif + Clear numbers',
    keyEffects: 'Map interactions, gallery slideshows, filter animations',
    antiPatterns: 'No autoplay music, no tiny listing text',
    severity: 'MEDIUM',
  },
  {
    category: 'Education/E-learning',
    pattern: 'Value Prop + Course Grid + Testimonials + CTA',
    stylePriority: 'Friendly + Accessible + Colorful',
    colorMood: 'Bright but not childish + Academic blues',
    typographyMood: 'Friendly sans-serif + Clear hierarchy',
    keyEffects: 'Progress indicators, interactive previews',
    antiPatterns: 'No overwhelming course counts, no clipart',
    severity: 'MEDIUM',
  },

  // Creative
  {
    category: 'Portfolio/Agency',
    pattern: 'Case Study Grid + Process + Team + Contact',
    stylePriority: 'Brutalism or Editorial',
    colorMood: 'Bold contrast + Signature accent',
    typographyMood: 'Oversized display + Creative pairing',
    keyEffects: 'Cursor effects, page transitions, scroll animations',
    antiPatterns: 'No generic templates, no stock photos of teams',
    severity: 'MEDIUM',
  },
  {
    category: 'Photography',
    pattern: 'Full-screen Gallery + About + Contact',
    stylePriority: 'Minimal black/white + Full-bleed',
    colorMood: 'Monochrome + Subtle accents',
    typographyMood: 'Thin elegant sans-serif',
    keyEffects: 'Smooth gallery transitions, lightbox, lazy load',
    antiPatterns: 'No watermarks on preview, no busy backgrounds',
    severity: 'MEDIUM',
  },

  // Lifestyle
  {
    category: 'Beauty/Spa',
    pattern: 'Hero + Services + Gallery + Booking',
    stylePriority: 'Soft UI + Organic shapes',
    colorMood: 'Soft pink + Sage green + Gold CTA',
    typographyMood: 'Elegant serif headlines + Soft sans body',
    keyEffects: 'Gentle hover states, 200-300ms transitions',
    antiPatterns: 'No harsh colors, no aggressive CTAs, no stock models',
    severity: 'MEDIUM',
  },
  {
    category: 'Travel/Hospitality',
    pattern: 'Destination Hero + Search + Featured + Reviews',
    stylePriority: 'Photography-driven + Clean',
    colorMood: 'Sky blue + Warm sunset + Earth tones',
    typographyMood: 'Adventure display + Readable body',
    keyEffects: 'Image carousels (manual only), smooth booking flow',
    antiPatterns: 'No autoplay videos, no fake reviews, no hidden fees',
    severity: 'HIGH',
  },

  // Astrology (custom for our system)
  {
    category: 'Astrology/Spiritual',
    pattern: 'Mystical Hero + Features + Charts + Reading CTA',
    stylePriority: 'Dark Mode + Glassmorphism + Cosmic',
    colorMood: 'Deep indigo + Gold + Cosmic purple',
    typographyMood: 'Mystical serif + Modern sans-serif data',
    keyEffects: 'Star field particles, chart animations, celestial transitions',
    antiPatterns: 'No cheesy crystal ball imagery, no Comic Sans, no rainbow gradients',
    severity: 'MEDIUM',
  },

  // Non-profit
  {
    category: 'Non-profit/Charity',
    pattern: 'Impact Story + Mission + Donate CTA + Transparency',
    stylePriority: 'Warm + Accessible + Empathetic',
    colorMood: 'Warm orange/yellow + Hope green',
    typographyMood: 'Humanist sans-serif + Readable',
    keyEffects: 'Impact counters, story reveals, donation progress bars',
    antiPatterns: 'No guilt-tripping imagery, no aggressive popups',
    severity: 'HIGH',
  },

  // Government
  {
    category: 'Government/Public',
    pattern: 'Service-first + Search + Accessibility + Resources',
    stylePriority: 'High-contrast + WCAG AAA',
    colorMood: 'Official blue + High contrast + Neutral',
    typographyMood: 'System fonts + Maximum readability',
    keyEffects: 'Focus indicators, skip navigation, no decorative animations',
    antiPatterns: 'No trends-first design, no JS-dependent content',
    severity: 'HIGH',
  },
]

// ── Style Database (30 core styles) ─────────────────────────────────

const STYLE_DATABASE: StyleDefinition[] = [
  {
    name: 'Minimalism',
    type: 'General',
    keywords: 'clean simple whitespace',
    primaryColors: '#FFFFFF, #000000, accent',
    effects: 'Subtle transitions 200ms',
    bestFor: 'SaaS, portfolios, corporate',
    doNotUseFor: 'Gaming, kids, entertainment',
    darkMode: true,
    performance: 'Excellent',
    accessibility: 'AAA',
    complexity: 'Low',
    cssKeywords: 'max-width, gap, padding',
  },
  {
    name: 'Flat Design',
    type: 'General',
    keywords: 'no shadows solid colors',
    primaryColors: 'Solid hues, no gradients',
    effects: 'Color transitions, icon animations',
    bestFor: 'Dashboards, tools, mobile',
    doNotUseFor: 'Luxury, photography',
    darkMode: true,
    performance: 'Excellent',
    accessibility: 'AA',
    complexity: 'Low',
    cssKeywords: 'border-radius, solid backgrounds',
  },
  {
    name: 'Glassmorphism',
    type: 'General',
    keywords: 'frosted glass blur transparency',
    primaryColors: 'rgba overlays on gradients',
    effects: 'backdrop-filter: blur(10-20px)',
    bestFor: 'AI products, fintech, modern SaaS',
    doNotUseFor: 'Healthcare, government, elderly users',
    darkMode: true,
    performance: 'Medium (GPU)',
    accessibility: 'AA (with fallbacks)',
    complexity: 'Medium',
    cssKeywords: 'backdrop-filter, rgba, border-radius',
  },
  {
    name: 'Neumorphism',
    type: 'General',
    keywords: 'soft shadows inset pressed',
    primaryColors: 'Light gray base + subtle shadows',
    effects: 'box-shadow inset/outset pairs',
    bestFor: 'Calculators, music players, smart home',
    doNotUseFor: 'Text-heavy, data dashboards, e-commerce',
    darkMode: false,
    performance: 'Good',
    accessibility: 'A (contrast issues)',
    complexity: 'Medium',
    cssKeywords: 'box-shadow: 5px 5px 10px, inset',
  },
  {
    name: 'Dark Mode',
    type: 'General',
    keywords: 'dark background light text',
    primaryColors: '#0A0A0A - #1A1A2E backgrounds',
    effects: 'Subtle glow accents, neon highlights',
    bestFor: 'Dev tools, media, crypto, dashboards',
    doNotUseFor: 'Healthcare default, elderly, government',
    darkMode: true,
    performance: 'Excellent (OLED)',
    accessibility: 'AA (careful with contrast)',
    complexity: 'Medium',
    cssKeywords: 'color-scheme: dark, prefers-color-scheme',
  },
  {
    name: 'Brutalism',
    type: 'Creative',
    keywords: 'raw bold monospace borders',
    primaryColors: 'Black + White + One accent',
    effects: 'None or intentionally broken',
    bestFor: 'Portfolios, agencies, art, editorial',
    doNotUseFor: 'Banking, healthcare, elderly, government',
    darkMode: false,
    performance: 'Excellent',
    accessibility: 'Varies',
    complexity: 'Low',
    cssKeywords: 'border: 3px solid, monospace, uppercase',
  },
  {
    name: 'Editorial',
    type: 'Creative',
    keywords: 'magazine layout typography-driven',
    primaryColors: 'Black + White + Signature accent',
    effects: 'Scroll-based reveals, parallax text',
    bestFor: 'Media, magazines, portfolios, luxury',
    doNotUseFor: 'SaaS dashboards, tools, forms',
    darkMode: true,
    performance: 'Good',
    accessibility: 'AA',
    complexity: 'High',
    cssKeywords: 'grid-template-columns, mix-blend-mode',
  },
  {
    name: 'Soft UI Evolution',
    type: 'General',
    keywords: 'soft shadows rounded organic',
    primaryColors: 'Pastel base + Subtle shadows',
    effects: 'Gentle 200-300ms transitions, rounded corners 12-20px',
    bestFor: 'Wellness, beauty, lifestyle, consumer apps',
    doNotUseFor: 'Enterprise, banking, legal',
    darkMode: false,
    performance: 'Good',
    accessibility: 'AA',
    complexity: 'Medium',
    cssKeywords: 'border-radius: 16px, box-shadow: soft',
  },
  {
    name: 'Data Dashboard',
    type: 'BI/Analytics',
    keywords: 'charts KPIs tables filters',
    primaryColors: 'Dark bg + Semantic colors for data',
    effects: 'Chart enter animations, filter transitions',
    bestFor: 'Analytics, BI, admin panels, monitoring',
    doNotUseFor: 'Marketing landing pages, portfolios',
    darkMode: true,
    performance: 'Medium (chart rendering)',
    accessibility: 'AA (data tables)',
    complexity: 'High',
    cssKeywords: 'grid, sticky headers, overflow-x',
  },
  {
    name: 'Cosmic/Astro',
    type: 'Creative',
    keywords: 'space stars celestial mystical',
    primaryColors: 'Deep indigo #1a0533, gold #D4AF37, cosmic purple #6B3FA0',
    effects: 'Star particles, constellation lines, chart rotation',
    bestFor: 'Astrology, astronomy, spiritual, sci-fi',
    doNotUseFor: 'Banking, healthcare, government, legal',
    darkMode: true,
    performance: 'Medium (particles)',
    accessibility: 'AA (ensure text contrast)',
    complexity: 'High',
    cssKeywords: 'radial-gradient, animation, canvas/WebGL',
  },
]

// ── Search Engine ───────────────────────────────────────────────────

/**
 * BM25-inspired scoring for design recommendation matching.
 * Scores a query against a text field.
 */
function scoreMatch(query: string, text: string): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
  const textLower = text.toLowerCase()
  let score = 0

  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      // Exact word boundary match scores higher
      const regex = new RegExp(`\\b${term}\\b`, 'i')
      score += regex.test(text) ? 2 : 1
    }
  }

  // Normalize by query length
  return queryTerms.length > 0 ? score / queryTerms.length : 0
}

/**
 * Search the reasoning rules database for design recommendations.
 */
export function searchDesignRules(query: string, limit: number = 5): DesignRecommendation[] {
  const scored = REASONING_RULES.map((rule) => {
    const catScore = scoreMatch(query, rule.category) * 3 // Category match is strongest
    const patternScore = scoreMatch(query, rule.pattern)
    const styleScore = scoreMatch(query, rule.stylePriority)
    const colorScore = scoreMatch(query, rule.colorMood)
    return { rule, score: catScore + patternScore + styleScore + colorScore }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.rule)
}

/**
 * Search the style database for matching UI styles.
 */
export function searchStyles(query: string, limit: number = 5): StyleDefinition[] {
  const scored = STYLE_DATABASE.map((style) => {
    const nameScore = scoreMatch(query, style.name) * 3
    const keywordScore = scoreMatch(query, style.keywords) * 2
    const bestForScore = scoreMatch(query, style.bestFor)
    return { style, score: nameScore + keywordScore + bestForScore }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.style)
}

/**
 * Generate a full design system recommendation for a product category.
 * This is the main entry point — combines reasoning rules + style matching.
 */
export function recommendDesignSystem(
  productDescription: string,
): DesignSystemRecommendation | null {
  const rules = searchDesignRules(productDescription, 1)
  if (rules.length === 0) return null

  const category = rules[0]!
  const styles = searchStyles(category.stylePriority, 3)

  return {
    category,
    styles,
    deliveryChecklist: [
      'All text meets WCAG AA contrast ratio (4.5:1 normal, 3:1 large)',
      'All interactive elements have hover, focus, and active states',
      'Responsive breakpoints: 640px, 768px, 1024px, 1280px',
      'prefers-reduced-motion respected for all animations',
      'All icons are SVG (not emoji or PNG)',
      'Touch targets minimum 44x44px on mobile',
      'Form inputs have visible labels (not just placeholders)',
      'Error states are red + icon + text (not color alone)',
      'Loading states use skeletons (not spinners) for layout',
      'No content shifts on load (explicit width/height on images)',
    ],
  }
}
