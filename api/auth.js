// Vercel Edge middleware — Basic Auth protection for tsb-insights
export const config = { matcher: ['/((?!_next/static|favicon.ico).*)'] }

export default function middleware(request) {
  const auth = request.headers.get('authorization')

  if (auth) {
    const [scheme, encoded] = auth.split(' ')
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded)
      const colon = decoded.indexOf(':')
      const user = decoded.slice(0, colon)
      const pass = decoded.slice(colon + 1)

      const validUser = process.env.INSIGHTS_USER
      const validPass = process.env.INSIGHTS_PASS

      if (user === validUser && pass === validPass) {
        return new Response(null, { status: 200 })
      }
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="TSB Insights"',
      'Content-Type': 'text/plain',
    },
  })
}
