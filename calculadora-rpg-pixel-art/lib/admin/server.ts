import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ADMIN_SESSION_PREFIX = 'admin:'

export const ENV_ADMIN_PREFIX = 'env-'

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_JWT_SECRET
  if (secret) return secret
  const fallback = `${process.env.OWNER_USERNAME ?? ''}:${process.env.OWNER_PASSWORD ?? ''}:${process.env.COOWNER_PASSWORD ?? ''}`
  return fallback.length > 2 ? `calcquest-admin:${fallback}` : null
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY))
}

export function createAdminSession(userId: string, role: AdminRole) {
  const secret = getSessionSecret()
  if (!secret) throw new Error('Admin session secret is not configured')
  const value = `${ADMIN_SESSION_PREFIX}${role}:${userId}`
  const signature = createHmac('sha256', secret).update(value).digest('hex')
  return `${value}.${signature}`
}

function verifyAdminSession(token: string | undefined) {
  const secret = getSessionSecret()
  if (!secret || !token?.startsWith(ADMIN_SESSION_PREFIX)) return null
  const separator = token.lastIndexOf('.')
  const value = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = createHmac('sha256', secret).update(value).digest('hex')
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  const [, role, userId] = value.split(':')
  if (!userId || !['OWNER', 'CO-OWNER'].includes(role)) return null
  return { userId, role: role as AdminRole }
}

export async function requireAdminSession(token: string | undefined) {
  const session = verifyAdminSession(token)
  if (!session) return null
  if (session.userId.startsWith(ENV_ADMIN_PREFIX) || !isSupabaseConfigured()) return session
  const admin = getAdminClient()
  const { data } = await admin.from('admin_users').select('role, active').eq('user_id', session.userId).maybeSingle()
  if (!data?.active || data.role !== session.role) return null
  return session
}

export async function requireOwnerSession(token: string | undefined) {
  const session = await requireAdminSession(token)
  return session
}

export function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase server credentials are not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function getAuthClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase auth credentials are not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type AdminRole = 'OWNER' | 'CO-OWNER'

export async function requireAdmin(accessToken: string | undefined) {
  if (!accessToken || accessToken.startsWith(ADMIN_SESSION_PREFIX) || !isSupabaseConfigured()) return null
  const auth = getAuthClient()
  const { data: userData } = await auth.auth.getUser(accessToken)
  if (!userData.user) return null
  const admin = getAdminClient()
  const { data } = await admin.from('admin_users').select('role, active').eq('user_id', userData.user.id).maybeSingle()
  if (!data?.active || !['OWNER', 'CO-OWNER'].includes(data.role)) return null
  return { user: userData.user, role: data.role as AdminRole }
}

export function canManageSettings(role: AdminRole) {
  return role === 'OWNER' || role === 'CO-OWNER'
}
