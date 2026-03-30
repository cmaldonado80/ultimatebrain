import { proxyToMiniBrain } from '../../../../lib/astrology/proxy'

export async function POST(req: Request) {
  return proxyToMiniBrain(req, '/astrology/natal-summary')
}
