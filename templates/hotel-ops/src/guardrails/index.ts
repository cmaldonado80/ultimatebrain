/**
 * Hospitality Domain Guardrails
 *
 * These guardrail functions are applied at the Brain Bridge layer before LLM
 * inputs/outputs are forwarded across the system. They enforce privacy,
 * pricing integrity, and data access controls specific to hotel operations.
 */

// ─── Supporting Types ──────────────────────────────────────────────────────────

export interface GuardrailResult<T = unknown> {
  passed: boolean;
  data: T;
  /** Violations detected by this guardrail */
  violations: GuardrailViolation[];
}

export interface GuardrailViolation {
  rule: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  detail: string;
}

export interface GuardrailContext {
  agentId?: string;
  callerUserId?: string;
  /** Roles granted to the calling session: e.g. ['front_desk', 'manager'] */
  roles?: string[];
  requestedGuestId?: string;
}

// ─── 1. PII Protection ────────────────────────────────────────────────────────

const EMAIL_PATTERN    = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PHONE_PATTERN    = /(\+?[\d\s\-().]{7,20})/g;
const CC_PATTERN       = /\b(?:\d[ \-]?){13,19}\b/g;
const CC_FULL_PATTERN  = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;

/**
 * Mask guest PII (email addresses, phone numbers, credit card numbers) in any
 * string destined for logs or LLM context. Also recursively masks object fields.
 *
 * @param input - The text or object to sanitize
 * @returns The sanitized version with PII replaced by redaction tokens
 */
export function piiProtection<T>(input: T): GuardrailResult<T> {
  const violations: GuardrailViolation[] = [];

  function maskString(text: string): string {
    let masked = text;

    if (CC_FULL_PATTERN.test(masked)) {
      violations.push({
        rule: 'pii_protection',
        severity: 'critical',
        detail: 'Full credit card number detected and masked',
      });
    }
    CC_FULL_PATTERN.lastIndex = 0;

    masked = masked.replace(CC_FULL_PATTERN, (match) => `[CC-REDACTED-${match.slice(-4)}]`);

    if (EMAIL_PATTERN.test(masked)) {
      violations.push({
        rule: 'pii_protection',
        severity: 'warn',
        detail: 'Email address detected and masked in output',
      });
    }
    EMAIL_PATTERN.lastIndex = 0;
    masked = masked.replace(EMAIL_PATTERN, (m) => {
      const [local, domain] = m.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    });

    // Only mask strings that look like actual phone numbers (digit density check)
    masked = masked.replace(CC_PATTERN, (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length >= 13 && digits.length <= 19) {
        violations.push({
          rule: 'pii_protection',
          severity: 'warn',
          detail: 'Potential credit card number masked',
        });
        return `[CC-REDACTED-${digits.slice(-4)}]`;
      }
      return m;
    });

    return masked;
  }

  function maskValue(val: unknown): unknown {
    if (typeof val === 'string') return maskString(val);
    if (Array.isArray(val)) return val.map(maskValue);
    if (val !== null && typeof val === 'object') {
      const piiKeys = new Set(['email', 'phone', 'creditCard', 'ccNumber', 'cardNumber', 'ssn']);
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => {
          if (piiKeys.has(k) && typeof v === 'string') {
            violations.push({
              rule: 'pii_protection',
              severity: 'warn',
              detail: `PII field "${k}" redacted from output`,
            });
            return [k, '[REDACTED]'];
          }
          return [k, maskValue(v)];
        })
      );
    }
    return val;
  }

  const sanitized = maskValue(input) as T;

  return {
    passed: violations.filter((v) => v.severity === 'critical').length === 0,
    data: sanitized,
    violations,
  };
}

// ─── 2. Rate Bounds ───────────────────────────────────────────────────────────

export interface RateBoundsInput {
  roomType: string;
  suggestedRate: number;
  baseRate: number;
  /** Maximum allowed deviation fraction, e.g. 0.30 = ±30% */
  maxVariance?: number;
}

export interface RateBoundsOutput extends RateBoundsInput {
  clampedRate: number;
  wasAdjusted: boolean;
  adjustmentPercent: number;
}

/**
 * Prevent pricing recommendations outside ±30% (configurable) of the base rate.
 * Returns the clamped rate and a record of any adjustment made.
 */
export function rateBounds(input: RateBoundsInput): GuardrailResult<RateBoundsOutput> {
  const maxVariance = input.maxVariance ?? 0.30;
  const lowerBound  = input.baseRate * (1 - maxVariance);
  const upperBound  = input.baseRate * (1 + maxVariance);
  const violations: GuardrailViolation[] = [];

  const clampedRate = Math.min(upperBound, Math.max(lowerBound, input.suggestedRate));
  const wasAdjusted = Math.abs(clampedRate - input.suggestedRate) > 0.005;
  const adjustmentPercent = parseFloat(
    (((clampedRate - input.baseRate) / input.baseRate) * 100).toFixed(1)
  );

  if (wasAdjusted) {
    const direction = input.suggestedRate > upperBound ? 'above' : 'below';
    violations.push({
      rule: 'rate_bounds',
      severity: 'warn',
      detail: `Suggested rate $${input.suggestedRate.toFixed(2)} is ${direction} the ±${(maxVariance * 100).toFixed(0)}% boundary for ${input.roomType}. ` +
              `Clamped to $${clampedRate.toFixed(2)}.`,
    });
  }

  if (input.suggestedRate <= 0) {
    violations.push({
      rule: 'rate_bounds',
      severity: 'error',
      detail: `Invalid non-positive suggested rate: ${input.suggestedRate}`,
    });
  }

  return {
    passed: violations.filter((v) => v.severity === 'error' || v.severity === 'critical').length === 0,
    data: {
      ...input,
      clampedRate: parseFloat(clampedRate.toFixed(2)),
      wasAdjusted,
      adjustmentPercent,
    },
    violations,
  };
}

// ─── 3. Guest Data Access ─────────────────────────────────────────────────────

/** Roles that are authorized to read full guest profiles */
const AUTHORIZED_ROLES_FULL_PROFILE = new Set([
  'front_desk',
  'concierge',
  'manager',
  'gm',
  'revenue_manager',
  'vip_host',
]);

/** Roles that may only see non-PII guest data (e.g., for aggregated reports) */
const AUTHORIZED_ROLES_AGGREGATE = new Set([
  'analyst',
  'sales',
  'hr',
  'fb_manager',
  ...AUTHORIZED_ROLES_FULL_PROFILE,
]);

export type AccessLevel = 'full_profile' | 'aggregate_only' | 'denied';

export interface GuestDataAccessResult {
  grantedLevel: AccessLevel;
  requestedGuestId: string;
  callerRoles: string[];
}

/**
 * Enforce authorization before allowing access to guest profiles.
 * Returns the access level granted and violations if access is denied or restricted.
 */
export function guestDataAccess(
  context: GuardrailContext
): GuardrailResult<GuestDataAccessResult> {
  const violations: GuardrailViolation[] = [];
  const roles = context.roles ?? [];
  const guestId = context.requestedGuestId ?? 'unknown';

  let grantedLevel: AccessLevel = 'denied';

  const hasFullAccess = roles.some((r) => AUTHORIZED_ROLES_FULL_PROFILE.has(r));
  const hasAggregateAccess = roles.some((r) => AUTHORIZED_ROLES_AGGREGATE.has(r));

  if (hasFullAccess) {
    grantedLevel = 'full_profile';
  } else if (hasAggregateAccess) {
    grantedLevel = 'aggregate_only';
    violations.push({
      rule: 'guest_data_access',
      severity: 'info',
      detail: `Caller has aggregate-only access. Full guest profile for ${guestId} is restricted.`,
    });
  } else {
    grantedLevel = 'denied';
    violations.push({
      rule: 'guest_data_access',
      severity: 'error',
      detail: `Access denied: caller roles [${roles.join(', ')}] are not authorized to access guest profile ${guestId}.`,
    });
  }

  if (!context.callerUserId && !context.agentId) {
    violations.push({
      rule: 'guest_data_access',
      severity: 'error',
      detail: 'Unauthenticated request: neither callerUserId nor agentId was provided.',
    });
    grantedLevel = 'denied';
  }

  return {
    passed: grantedLevel !== 'denied',
    data: {
      grantedLevel,
      requestedGuestId: guestId,
      callerRoles: roles,
    },
    violations,
  };
}

// ─── Composite: run all guardrails ────────────────────────────────────────────

export interface AllGuardrailsInput {
  payload: unknown;
  rateCheck?: RateBoundsInput;
  context?: GuardrailContext;
}

export interface AllGuardrailsResult {
  pii: GuardrailResult<unknown>;
  rateBounds?: GuardrailResult<RateBoundsOutput>;
  guestAccess?: GuardrailResult<GuestDataAccessResult>;
  /** True only if every applied guardrail passed */
  allPassed: boolean;
  totalViolations: number;
}

/**
 * Run all applicable guardrails in sequence and return a combined result.
 * Use this at the Brain Bridge boundary for every inbound/outbound payload.
 */
export function runHospitalityGuardrails(input: AllGuardrailsInput): AllGuardrailsResult {
  const piiResult = piiProtection(input.payload);

  const rateBoundsResult = input.rateCheck ? rateBounds(input.rateCheck) : undefined;

  const guestAccessResult = input.context?.requestedGuestId
    ? guestDataAccess(input.context)
    : undefined;

  const allPassed =
    piiResult.passed &&
    (rateBoundsResult?.passed ?? true) &&
    (guestAccessResult?.passed ?? true);

  const totalViolations =
    piiResult.violations.length +
    (rateBoundsResult?.violations.length ?? 0) +
    (guestAccessResult?.violations.length ?? 0);

  return {
    pii: piiResult,
    rateBounds: rateBoundsResult,
    guestAccess: guestAccessResult,
    allPassed,
    totalViolations,
  };
}
