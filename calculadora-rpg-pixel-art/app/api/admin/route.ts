import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ENV_ADMIN_PREFIX, createAdminSession, getAdminClient, getAuthClient, isSupabaseConfigured, requireAdmin, requireAdminSession, type AdminRole } from '@/lib/admin/server'

const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) })
const attempts = new Map<string, { count: number; resetAt: number }>()

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 8 }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const now = Date.now()
    const current = attempts.get(ip)
    if (current && current.resetAt > now && current.count >= 8) return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 })
    if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    else current.count += 1
    const parsed = loginSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    const body = parsed.data

    const envAccount = findEnvAccount(body.username, body.password)
    if (envAccount) {
      const userId = await resolveAdminUserId(envAccount.username, envAccount.role)
      const response = NextResponse.json({ ok: true, role: envAccount.role })
      response.cookies.set('admin_access_token', createAdminSession(userId, envAccount.role), cookieOptions())
      await logAdminAction(userId, 'LOGIN', 'success')
      attempts.delete(ip)
      return response
    }

    if (!isSupabaseConfigured()) {
      const configured = Boolean(process.env.OWNER_PASSWORD || process.env.COOWNER_PASSWORD)
      return NextResponse.json({ error: configured ? 'Usuario o contraseña incorrectos' : 'Admin no configurado: faltan OWNER_USERNAME y OWNER_PASSWORD' }, { status: 401 })
    }

    const admin = getAdminClient()
    const { data: record } = await admin.from('admin_users').select('user_id, role, active').ilike('username', body.username).maybeSingle()
    if (!record?.active || !['OWNER', 'CO-OWNER'].includes(record.role)) return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    const auth = getAuthClient()
    const { data: authData, error } = await auth.auth.signInWithPassword({ email: `${body.username.toLowerCase()}@calcquest.local`, password: body.password })
    if (error || !authData.session) return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    await logAdminAction(authData.user.id, 'LOGIN', 'success')
    const response = NextResponse.json({ ok: true, role: record.role })
    response.cookies.set('admin_access_token', authData.session.access_token, cookieOptions())
    response.cookies.set('admin_refresh_token', authData.session.refresh_token, cookieOptions())
    return response
  } catch (error) {
    console.error('[admin] login failed', error)
    return NextResponse.json({ error: 'Error del servidor al iniciar sesión' }, { status: 500 })
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function findEnvAccount(username: string, password: string) {
  const accounts = [
    { username: process.env.OWNER_USERNAME?.trim().toLowerCase(), password: process.env.OWNER_PASSWORD, role: 'OWNER' as const },
    { username: process.env.COOWNER_USERNAME?.trim().toLowerCase(), password: process.env.COOWNER_PASSWORD, role: 'CO-OWNER' as const },
  ]
  const name = username.trim().toLowerCase()
  const match = accounts.find((account) => account.username && account.password && name === account.username && safeEqual(password, account.password))
  return match ? { username: match.username as string, role: match.role } : null
}

async function resolveAdminUserId(username: string, role: AdminRole) {
  if (!isSupabaseConfigured()) return `${ENV_ADMIN_PREFIX}${role}`
  try {
    const { data } = await getAdminClient().from('admin_users').select('user_id, active').ilike('username', username).maybeSingle()
    if (data?.active) return data.user_id as string
  } catch {}
  return `${ENV_ADMIN_PREFIX}${role}`
}

async function logAdminAction(userId: string, action: string, result: string) {
  if (!isSupabaseConfigured() || userId.startsWith(ENV_ADMIN_PREFIX)) return
  try { await getAdminClient().from('admin_logs').insert({ admin_user_id: userId, action, result }) } catch {}
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request.cookies.get('admin_access_token')?.value)
  const adminSession = await requireAdminSession(request.cookies.get('admin_access_token')?.value)
  if (!session && !adminSession) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isSupabaseConfigured()) return NextResponse.json({ role: (session ?? adminSession)?.role, players: [], attacks: [], logs: [] })
  const admin = getAdminClient()
  const [{ data: players }, { data: attacks }, { data: logs }] = await Promise.all([
    admin.from('game_sessions').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('game_attacks').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(12),
  ])
  return NextResponse.json({ role: (session ?? adminSession)?.role, players: players ?? [], attacks: attacks ?? [], logs: logs ?? [] })
}

export async function PATCH(request: NextRequest) {
  const adminSession = await requireAdminSession(request.cookies.get('admin_access_token')?.value)
  if (!adminSession) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const body = z.object({ playerId: z.string().uuid(), hp: z.number().int().min(0).max(9999), max_hp: z.number().int().min(1).max(9999).optional(), status: z.string().max(32).optional() }).parse(await request.json())
    const admin = getAdminClient()
    const updates: Record<string, unknown> = { hp: body.hp, updated_at: new Date().toISOString() }
    if (body.max_hp !== undefined) updates.max_hp = body.max_hp
    if (body.status !== undefined) updates.status = body.status
    const { data, error } = await admin.from('game_sessions').update(updates).eq('id', body.playerId).select('*').single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar el jugador' }, { status: 400 })
    await admin.from('admin_logs').insert({ admin_user_id: adminSession.userId, action: 'UPDATE_PLAYER', result: `HP ${body.hp}` })
    return NextResponse.json({ player: data })
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
}

export async function PUT(request: NextRequest) {
  const adminSession = await requireAdminSession(request.cookies.get('admin_access_token')?.value)
  if (!adminSession || !['OWNER', 'CO-OWNER'].includes(adminSession.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = z.object({ action: z.string().regex(/^(set_hp|set_max_hp|immortal|speed|attack_speed|difficulty|phase|pause|resume|restart|victory|gameover|launch_attack)$/), value: z.union([z.number(), z.boolean()]).optional() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  await logAdminAction(adminSession.userId, `LOCAL_${parsed.data.action.toUpperCase()}`, JSON.stringify(parsed.data.value ?? null))
  return NextResponse.json({ ok: true, role: adminSession.role })
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('admin_access_token')?.value
  const session = await requireAdmin(token)
  const adminSession = await requireAdminSession(request.cookies.get('admin_access_token')?.value)
  if (!session && !adminSession) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('admin_access_token')
  response.cookies.delete('admin_refresh_token')
  response.cookies.delete('admin_owner_session')
  return response
}
