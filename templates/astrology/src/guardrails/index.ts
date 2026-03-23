/**
 * Astrology Domain Guardrails
 *
 * Guardrail rules enforced at the output layer before any agent response is
 * delivered to callers or downstream agents. Each guardrail is a named,
 * composable rule with a check function and metadata for the guardrail engine.
 *
 * Integration: pass these rules to brain.guardrails.check() in the Brain Bridge,
 * or apply them directly via the GuardrailsEngine from @solarc/brain-sdk.
 */

// ─── Guardrail Types ───────────────────────────────────────────────────────────

/** Severity level of a guardrail violation */
export type GuardrailSeverity = 'warn' | 'block';

/** Result of a guardrail check */
export interface GuardrailResult {
  /** Name of the guardrail that was checked */
  guardrail: string;
  /** Whether the content passed (true) or violated (false) the rule */
  passed: boolean;
  /** Human-readable reason when the check fails */
  reason?: string;
  /** Sanitised/transformed output to use instead of the original (for non-blocking rules) */
  sanitised?: string;
}

/** A guardrail rule definition */
export interface GuardrailRule {
  /** Unique kebab-case identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this guardrail protects against */
  description: string;
  /** Whether a violation should block output entirely or just warn */
  severity: GuardrailSeverity;
  /**
   * Check a piece of text for violations.
   * Returns a GuardrailResult — failed=false means violation detected.
   */
  check: (text: string, context?: GuardrailContext) => GuardrailResult;
}

/** Optional context passed to guardrail checks */
export interface GuardrailContext {
  agentId?:   string;
  clientId?:  string;
  readingType?: string;
  /** Raw input that triggered the response */
  userInput?: string;
}

// ─── Medical Claims Guardrail ──────────────────────────────────────────────────

/**
 * noMedicalClaims
 *
 * Blocks any output that makes health-related predictions, diagnoses, or
 * prognostic claims. Astrology must never substitute for medical advice.
 *
 * Triggers on: illness names, diagnostic language, symptom predictions,
 * references to body systems as predictive outcomes.
 */
const MEDICAL_PATTERNS = [
  /\b(diagnos|prognos|cancer\s+disease|tumor|tumour|terminal|fatal\s+illness)\b/i,
  /\b(will\s+(develop|contract|suffer|die\s+from|get)\s+(illness|disease|condition|cancer|diabetes|heart\s+attack|stroke))\b/i,
  /\b(your\s+(health|body|immune\s+system)\s+will\s+(fail|weaken|deteriorate|collapse))\b/i,
  /\b(predict[s]?\s+(illness|disease|death|medical|health))\b/i,
  /\b(astrological[ly]?\s+(cause[sd]?|indicate[sd]?|confirm[sd]?)\s+(illness|disease|cancer|death))\b/i,
];

export const noMedicalClaims: GuardrailRule = {
  id:          'no-medical-claims',
  name:        'No Medical Claims',
  description: 'Prevents health predictions, diagnoses, or medical prognoses from appearing in astrological readings.',
  severity:    'block',
  check(text: string, context?: GuardrailContext): GuardrailResult {
    for (const pattern of MEDICAL_PATTERNS) {
      if (pattern.test(text)) {
        return {
          guardrail: this.id,
          passed:    false,
          reason:    `Output contains language that may constitute a medical claim or health prediction. Pattern matched: ${pattern.source}. Astrological readings must not predict illness, disease, or medical conditions.`,
        };
      }
    }
    return { guardrail: this.id, passed: true };
  },
};

// ─── Financial Advice Guardrail ────────────────────────────────────────────────

/**
 * noFinancialAdvice
 *
 * Blocks specific financial or investment recommendations framed as
 * astrological guidance. General timing context is permitted; explicit
 * buy/sell/invest instructions are not.
 */
const FINANCIAL_PATTERNS = [
  /\b(buy|sell|invest|short|long)\s+(the\s+)?(stock|shares|crypto|bitcoin|ethereum|forex|futures|options|market)\b/i,
  /\b(this\s+is\s+a\s+good\s+time\s+to\s+(buy|sell|invest|put\s+money|move\s+money))\b/i,
  /\b(planet[s]?\s+(indicate[sd]?|suggest[sd]?|confirm[sd]?)\s+(stock|market|investment|crypto|trading)\s+(gain|profit|loss|crash|bull|bear))\b/i,
  /\b(your\s+(portfolio|investments?|stocks?|crypto)\s+will\s+(rise|fall|gain|lose|crash|skyrocket))\b/i,
  /\b(guaranteed\s+(profit|return|gain|income))\b/i,
];

export const noFinancialAdvice: GuardrailRule = {
  id:          'no-financial-advice',
  name:        'No Financial Advice',
  description: 'Prevents specific financial or investment recommendations from being presented as astrological guidance.',
  severity:    'block',
  check(text: string, context?: GuardrailContext): GuardrailResult {
    for (const pattern of FINANCIAL_PATTERNS) {
      if (pattern.test(text)) {
        return {
          guardrail: this.id,
          passed:    false,
          reason:    `Output contains language that may constitute specific financial or investment advice. Pattern matched: ${pattern.source}. Business astrology provides timing context only — it does not constitute financial advice.`,
        };
      }
    }
    return { guardrail: this.id, passed: true };
  },
};

// ─── Disclaimer Injection Guardrail ───────────────────────────────────────────

/**
 * disclaimerInjection
 *
 * A non-blocking (warn) guardrail that appends a standard "for entertainment
 * and self-reflection purposes" disclaimer to all reading outputs.
 * The sanitised field contains the text with the disclaimer appended.
 */
const DISCLAIMER_TEXT =
  '\n\n---\n*This astrological reading is provided for self-reflection and entertainment purposes only. ' +
  'It does not constitute medical, legal, financial, or professional advice. ' +
  'Planetary influences describe tendencies and potentials — all outcomes are shaped by free will, ' +
  'personal choices, and real-world circumstances. Consult qualified professionals for any decisions ' +
  'related to health, finance, or legal matters.*';

/** Returns true if the text already contains a disclaimer */
function hasDisclaimer(text: string): boolean {
  return /entertainment purposes|self.?reflection/i.test(text);
}

export const disclaimerInjection: GuardrailRule = {
  id:          'disclaimer-injection',
  name:        'Entertainment Disclaimer Injection',
  description: 'Automatically appends the standard entertainment/self-reflection disclaimer to all reading outputs if not already present.',
  severity:    'warn',
  check(text: string, context?: GuardrailContext): GuardrailResult {
    if (hasDisclaimer(text)) {
      return { guardrail: this.id, passed: true };
    }
    return {
      guardrail: this.id,
      passed:    false,
      reason:    'Reading output does not contain the required entertainment disclaimer.',
      sanitised: text + DISCLAIMER_TEXT,
    };
  },
};

// ─── Client Privacy Guardrail ─────────────────────────────────────────────────

/**
 * clientPrivacy
 *
 * Protects client birth data (birth date, time, place, email, phone) from
 * being echoed verbatim in outputs destined for third parties or logs.
 *
 * This guardrail warns rather than blocks, returning a sanitised version of
 * the text with PII redacted. The calling code should use the sanitised output
 * when writing to logs or sending to other agents.
 *
 * Pattern approach: detect typical formats for birth dates (ISO, long form),
 * times (HH:MM), email addresses, and phone numbers.
 */
const PII_PATTERNS: Array<{ label: string; pattern: RegExp; replacement: string }> = [
  {
    label:       'ISO birth date',
    pattern:     /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    replacement: '[BIRTH_DATE_REDACTED]',
  },
  {
    label:       'birth time',
    pattern:     /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
    replacement: '[BIRTH_TIME_REDACTED]',
  },
  {
    label:       'email address',
    pattern:     /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
  },
  {
    label:       'phone number',
    pattern:     /(?:\+?\d[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
];

export const clientPrivacy: GuardrailRule = {
  id:          'client-privacy',
  name:        'Client Birth Data PII Protection',
  description: 'Redacts birth date, birth time, email, and phone number from outputs destined for third parties or logs. Treats client birth data as sensitive PII.',
  severity:    'warn',
  check(text: string, context?: GuardrailContext): GuardrailResult {
    let sanitised  = text;
    const matched: string[] = [];

    for (const { label, pattern, replacement } of PII_PATTERNS) {
      const before = sanitised;
      sanitised = sanitised.replace(pattern, replacement);
      if (sanitised !== before) matched.push(label);
    }

    if (matched.length > 0) {
      return {
        guardrail: this.id,
        passed:    false,
        reason:    `Output contains potential client PII: ${matched.join(', ')}. Data has been redacted in the sanitised output.`,
        sanitised,
      };
    }

    return { guardrail: this.id, passed: true };
  },
};

// ─── Guardrail Runner ──────────────────────────────────────────────────────────

/** All domain guardrails as an ordered array */
export const ASTROLOGY_GUARDRAILS: GuardrailRule[] = [
  noMedicalClaims,
  noFinancialAdvice,
  disclaimerInjection,
  clientPrivacy,
];

/**
 * Run all guardrails against a piece of output text.
 *
 * @param text    Agent output to validate
 * @param context Optional context (agentId, clientId, etc.)
 * @returns       Array of all results; blocked=true if any 'block' severity rule failed
 */
export interface GuardrailRunResult {
  blocked:   boolean;
  results:   GuardrailResult[];
  /** Final sanitised text after applying all non-blocking transformations */
  finalText: string;
  blockedBy: string[];
}

export function runGuardrails(
  text: string,
  context?: GuardrailContext,
  rules: GuardrailRule[] = ASTROLOGY_GUARDRAILS,
): GuardrailRunResult {
  const results: GuardrailResult[] = [];
  let currentText = text;
  const blockedBy: string[] = [];

  for (const rule of rules) {
    const result = rule.check(currentText, context);
    results.push(result);

    if (!result.passed) {
      if (rule.severity === 'block') {
        blockedBy.push(rule.id);
      } else if (result.sanitised !== undefined) {
        // Apply non-blocking transformation (e.g., disclaimer injection)
        currentText = result.sanitised;
      }
    }
  }

  return {
    blocked:   blockedBy.length > 0,
    results,
    finalText: currentText,
    blockedBy,
  };
}
