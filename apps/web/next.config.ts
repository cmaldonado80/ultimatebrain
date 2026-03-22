import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@solarc/db', '@solarc/types', '@solarc/engine-contracts'],
}

export default nextConfig
