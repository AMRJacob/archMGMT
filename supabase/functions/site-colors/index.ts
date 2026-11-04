// site-colors: read a website's colours for a brand palette (Settings → Brand palettes → From a website).
//   POST { url } → { colors: ['#4b2e83', …], neutrals: ['#222222', …], title }
// Reads the page, its <meta name="theme-color">, <style> blocks, style="" attributes and up to six linked
// stylesheets; counts every colour; merges near-duplicates; returns the most-used ones (brand colours first,
// greys/near-black/near-white apart as "neutrals"). Signed-in archMGMT members only.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_BYTES = 2_000_000
const UA = 'Mozilla/5.0 (compatible; archMGMT-brand-colours/1.0)'

/** Only public http(s) addresses: no localhost, private ranges or link-local. */
function publicUrl(raw: string): URL | null {
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return null
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.startsWith('[')) return null
  return u
}

async function getText(u: URL): Promise<string> {
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,text/css,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`${u.hostname} answered ${r.status}`)
  const buf = await r.arrayBuffer()
  return new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf)
}

type RGB = [number, number, number]
const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Every colour written in a piece of CSS/HTML, with weights. */
function collect(text: string, weight: number, into: Map<string, number>) {
  const add = (c: RGB, w = weight) => { const k = hex(c); into.set(k, (into.get(k) ?? 0) + w) }
  for (const m of text.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)) {
    let h = m[1]
    if (h.length <= 4) { if (h.length === 4 && h[3].toLowerCase() !== 'f') continue; h = h.slice(0, 3).split('').map((x) => x + x).join('') }
    if (h.length === 8) { if (parseInt(h.slice(6), 16) < 128) continue; h = h.slice(0, 6) }
    // Brand colours are often defined once as a variable and used everywhere: count those more.
    const before = text.slice(Math.max(0, m.index! - 60), m.index!)
    add([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], /--[\w-]+\s*:\s*$/.test(before) ? weight * 3 : weight)
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi)) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1
    if (a < 0.5) continue
    add([+m[1], +m[2], +m[3]].map((v) => Math.min(255, v)) as RGB)
  }
}

const rgbOf = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const isNeutral = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b) < 28 || Math.max(r, g, b) < 30 || Math.min(r, g, b) > 238
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.2, a[2] - b[2])

/** Merge near-identical colours (keeping the most-used one), then sort by use. */
function cluster(counts: Map<string, number>, limit: number): string[] {
  const groups: { rgb: RGB; key: string; n: number; top: number }[] = []
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const c = rgbOf(k)
    const g = groups.find((x) => dist(x.rgb, c) < 30)
    if (g) g.n += n
    else groups.push({ rgb: c, key: k, n, top: n })
  }
  return groups.sort((a, b) => b.n - a.n).slice(0, limit).map((g) => g.key)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // Members only (an @amr-architects.com account or someone on the access list).
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await service.auth.getUser(token)
  const email = who?.user?.email?.toLowerCase()
  if (!email) return json({ error: 'Sign in first.' }, 401)
  if (!email.endsWith('@amr-architects.com')) {
    const { data: ok } = await service.from('app_access').select('email').eq('email', email).maybeSingle()
    if (!ok) return json({ error: 'You don’t have access to archMGMT.' }, 403)
  }

  let body: { url?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  const page = publicUrl(String(body.url ?? '').trim())
  if (!page) return json({ error: 'Enter a public website address, e.g. uca.edu' }, 400)

  const counts = new Map<string, number>()
  let html: string
  try { html = await getText(page) } catch (e) { return json({ error: `Couldn’t open that site: ${e instanceof Error ? e.message : e}` }, 400) }

  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
  for (const m of html.matchAll(/<meta[^>]+name=["'](?:theme-color|msapplication-TileColor)["'][^>]*>/gi)) collect(m[0], 25, counts)
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) collect(m[1], 1, counts)
  for (const m of html.matchAll(/style=["']([^"']*)["']/gi)) collect(m[1], 1, counts)
  // Some sites name colours in SVG fills (logos): count those a little more.
  for (const m of html.matchAll(/<svg[\s\S]*?<\/svg>/gi)) collect(m[0], 2, counts)

  const sheets = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0])
    .filter((t) => /rel=["']?[^"'>]*stylesheet/i.test(t))
    .map((t) => t.match(/href=["']([^"']+)["']/i)?.[1]).filter((h): h is string => Boolean(h))
    .map((h) => { try { return new URL(h, page) } catch { return null } })
    .filter((u): u is URL => Boolean(u && publicUrl(u.href)))
    // The site's own CSS first; font and icon libraries last.
    .sort((a, b) => Number(/fonts|icon|awesome/i.test(a.href)) - Number(/fonts|icon|awesome/i.test(b.href)))
    .slice(0, 6)
  await Promise.all(sheets.map(async (u) => { try { collect(await getText(u), 1, counts) } catch { /* skip that sheet */ } }))

  const brand = new Map<string, number>(), neutral = new Map<string, number>()
  for (const [k, n] of counts) (isNeutral(rgbOf(k)) ? neutral : brand).set(k, n)
  return json({ title, colors: cluster(brand, 12), neutrals: cluster(neutral, 4) })
})
