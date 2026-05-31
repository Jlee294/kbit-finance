/**
 * lib/google.ts — Google Service Account JWT auth
 *
 * Không cần googleapis — dùng Node.js crypto + fetch thuần.
 * Env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — e.g. kbit-finance@my-project.iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — PEM key từ JSON key file (có thể có \\n)
 */

import { createSign } from 'crypto'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function makeAssertionJwt(email: string, privateKey: string, scope: string): string {
  const now = Math.floor(Date.now() / 1000)

  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: email,
    scope,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }))

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const sig = base64url(sign.sign(privateKey))
  return `${header}.${payload}.${sig}`
}

// In-process token cache (per lambda warm instance)
interface TokenEntry { token: string; expiresAt: number }
const _cache = new Map<string, TokenEntry>()

/**
 * Returns a valid Google OAuth2 access token for the given scope.
 * Caches the token and refreshes 60s before expiry.
 */
export async function getAccessToken(scope: string): Promise<string> {
  const cached = _cache.get(scope)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error(
      'Google Service Account không được cấu hình. ' +
      'Cần GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY trong .env.local'
    )
  }

  // GCP Console escapes newlines — restore them
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const jwt = makeAssertionJwt(email, privateKey, scope)

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google OAuth lỗi: ${body}`)
  }

  const json = await res.json() as { access_token: string; expires_in: number }
  _cache.set(scope, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  })
  return json.access_token
}

/** Convenience: Drive scope */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

/** Convenience: Sheets scope */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
