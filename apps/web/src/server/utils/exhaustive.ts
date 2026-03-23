/**
 * Compile-time exhaustiveness check for discriminated unions.
 * Use in the default case of switch statements to ensure all variants are handled.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}
