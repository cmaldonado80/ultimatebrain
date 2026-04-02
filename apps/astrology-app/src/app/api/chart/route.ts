import { proxyToMiniBrain } from '@/lib/proxy'

export async function POST(req: Request) {
  return proxyToMiniBrain(req, '/astrology/natal-summary')
}
