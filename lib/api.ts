import { genericErrorMessage } from './errors'
import { requestId } from './request-id'

type ErrorBody = { error?: { code?: unknown; message?: unknown; [key: string]: unknown }; [key: string]: unknown }

function normalizeBody(data: unknown): unknown {
  if (!data || typeof data !== 'object' || !('error' in data)) return data
  const body = data as ErrorBody
  const error = body.error
  if (!error || typeof error !== 'object' || typeof error.code !== 'string') return data
  const { code, currentVersion } = error
  return {
    ...body,
    error: {
      ...(typeof currentVersion === 'number' ? { currentVersion } : {}),
      code,
      message: genericErrorMessage(code),
      requestId: requestId(),
    },
  }
}

export function jsonNoStore(data: unknown, status = 200): Response {
  return Response.json(normalizeBody(data), {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export function hasValidMutationHeaders(request: Request, requiresJson: boolean): boolean {
  const origin = request.headers.get('origin')
  let requestOrigin: string
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    return false
  }

  if (!origin || origin !== requestOrigin) return false
  if (requiresJson && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return false
  }

  const fetchSite = request.headers.get('sec-fetch-site')
  return !fetchSite || fetchSite === 'same-origin'
}
