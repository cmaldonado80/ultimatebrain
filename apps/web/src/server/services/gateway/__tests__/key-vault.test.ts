import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../env', () => ({
  env: { VAULT_SECRET: 'test-secret-at-least-16-chars!!' },
}))

import { decrypt, encrypt } from '../key-vault'

describe('encrypt / decrypt', () => {
  it('roundtrip produces original value', () => {
    const plaintext = 'sk-ant-my-super-secret-key'
    const ciphertext = encrypt(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('different plaintext produces different ciphertext (non-deterministic)', () => {
    const a = encrypt('hello')
    const b = encrypt('hello')
    // Same plaintext but random salt/IV means different ciphertext
    expect(a).not.toBe(b)
  })

  it('tampered ciphertext throws on decrypt', () => {
    const ciphertext = encrypt('secret-value')
    const buf = Buffer.from(ciphertext, 'base64')
    // Flip a byte in the encrypted data region
    buf[buf.length - 1] ^= 0xff
    const tampered = buf.toString('base64')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('empty string roundtrip works', () => {
    const ciphertext = encrypt('')
    expect(decrypt(ciphertext)).toBe('')
  })

  it('long string (1000 chars) roundtrip works', () => {
    const long = 'a'.repeat(1000)
    const ciphertext = encrypt(long)
    expect(decrypt(ciphertext)).toBe(long)
  })
})
