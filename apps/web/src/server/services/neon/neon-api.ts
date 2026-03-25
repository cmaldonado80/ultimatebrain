/**
 * Neon API Client — provisions and manages per-mini-brain PostgreSQL databases
 * via Neon's REST API using database branches.
 *
 * Docs: https://api-docs.neon.tech/reference/getting-started-with-neon-api
 */

const NEON_API_BASE = 'https://console.neon.tech/api/v2'

export interface NeonBranchResult {
  branchId: string
  endpointId: string
  host: string
  databaseName: string
  roleName: string
  connectionUri: string
}

export interface NeonBranchStatus {
  state: string
  name: string
  createdAt: string
}

async function neonFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${NEON_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown error')
    throw new Error(`Neon API error (${res.status}): ${body}`)
  }

  return res
}

/**
 * Create a new Neon branch with a read-write endpoint.
 * Each mini-brain gets its own branch (copy-on-write from parent).
 */
export async function createNeonBranch(opts: {
  apiKey: string
  projectId: string
  branchName: string
  databaseName?: string
  roleName?: string
}): Promise<NeonBranchResult> {
  const res = await neonFetch(`/projects/${opts.projectId}/branches`, opts.apiKey, {
    method: 'POST',
    body: JSON.stringify({
      branch: {
        name: opts.branchName,
      },
      endpoints: [
        {
          type: 'read_write',
        },
      ],
    }),
  })

  const data = await res.json()

  // Extract branch, endpoint, and connection info from response
  const branch = data.branch
  const endpoint = data.endpoints?.[0]
  const connUri = data.connection_uris?.[0]

  if (!branch || !endpoint) {
    throw new Error('Neon API returned incomplete branch data')
  }

  return {
    branchId: branch.id,
    endpointId: endpoint.id,
    host: endpoint.host ?? connUri?.connection_parameters?.host ?? '',
    databaseName: connUri?.connection_parameters?.database ?? opts.databaseName ?? 'neondb',
    roleName: connUri?.connection_parameters?.role ?? opts.roleName ?? 'neondb_owner',
    connectionUri: connUri?.connection_uri ?? '',
  }
}

/**
 * Delete a Neon branch (and its compute endpoint).
 */
export async function deleteNeonBranch(opts: {
  apiKey: string
  projectId: string
  branchId: string
}): Promise<void> {
  await neonFetch(`/projects/${opts.projectId}/branches/${opts.branchId}`, opts.apiKey, {
    method: 'DELETE',
  })
}

/**
 * Get the status of a Neon branch.
 */
export async function getNeonBranchStatus(opts: {
  apiKey: string
  projectId: string
  branchId: string
}): Promise<NeonBranchStatus> {
  const res = await neonFetch(`/projects/${opts.projectId}/branches/${opts.branchId}`, opts.apiKey)
  const data = await res.json()
  return {
    state: data.branch?.state ?? 'unknown',
    name: data.branch?.name ?? '',
    createdAt: data.branch?.created_at ?? '',
  }
}

/**
 * Mask a connection URI for safe display (hide password).
 */
export function maskConnectionUri(uri: string): string {
  try {
    const url = new URL(uri)
    if (url.password) {
      url.password = '****'
    }
    return url.toString()
  } catch {
    return uri.replace(/:[^:@]+@/, ':****@')
  }
}
