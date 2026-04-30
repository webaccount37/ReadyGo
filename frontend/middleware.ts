import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy API and health to the backend at request time.
 * next.config rewrites() bake destinations at build time (e.g. http://backend:8000 from Docker),
 * which breaks on Azure Container Apps where BACKEND_URL is set at runtime to the API FQDN.
 */
export function middleware(request: NextRequest) {
  // Bracket keys avoid DefinePlugin inlining a build-time BACKEND_URL into this bundle.
  const raw =
    process.env['BACKEND_URL'] ||
    process.env['NEXT_PUBLIC_API_URL'] ||
    'http://localhost:8000'
  const base = raw.replace(/\/$/, '')
  const path = request.nextUrl.pathname + request.nextUrl.search
  const dest = new URL(path, base)
  return NextResponse.rewrite(dest)
}

export const config = {
  matcher: ['/api/:path*', '/health'],
}
