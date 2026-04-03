import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only use standalone output for Docker builds, not Vercel (Vercel has its own adapter)
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  images: { formats: ['image/avif', 'image/webp'] },
  transpilePackages: [
    '@solarc/db',
    '@solarc/types',
    '@solarc/engine-contracts',
    '@solarc/ephemeris',
  ],
  serverExternalPackages: ['swisseph'],
  outputFileTracingIncludes: {
    '/api/**': ['./src/server/services/orchestration/agents/**/*.md'],
  },
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-inline needed for styled-jsx/Tailwind; unsafe-eval only in dev
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' ws: wss: https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
