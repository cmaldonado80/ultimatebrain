import { createServer } from 'net'

export async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}
