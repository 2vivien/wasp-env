export function jsonNoStore(data: unknown, status = 200): Response {
  return Response.json(data, {
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
