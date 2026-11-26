import { jsonNoStore } from '@/lib/api'

export function GET() {
  return jsonNoStore({ status: 'ok' })
}
