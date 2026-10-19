'use strict';
/**
 * Server Undangan Online — tanpa dependensi (hanya modul bawaan Node 18+).
 *
 *   node server.js
 *
 * Environment (opsional):
 *   PORT=3000                 port server
 *   ADMIN_PASSWORD=...        password dashboard (WAJIB diganti saat online)
 *   DATA_DIR=./data           lokasi database JSON
 *   UPLOAD_DIR=./uploads      lokasi file upload (video, foto, musik)
 *   TRUST_PROXY=1             percaya header X-Forwarded-* (di belakang nginx/Cloudflare)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./store');
const { makeInvitation, sanitizeInvitation, slugify, SLUG_RE } = require('./invitation-model');

const PORT = +process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MB = 1024 * 1024;
const UPLOAD_LIMITS = { video: 120 * MB, audio: 30 * MB, image: 15 * MB };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/* ============================== util ============================== */

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    ...headers,
  });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
const fail = (res, status, message) => json(res, status, { error: message });

function clientIp(req) {
  if (TRUST_PROXY) {
    const f = req.headers['x-forwarded-for'];
    if (f) return String(f).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  return TRUST_PROXY ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
}

function origin(req) {
  const proto = isHttps(req) ? 'https' : 'http';
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Ukuran data terlalu besar'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1 * MB) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    throw Object.assign(new Error('Format JSON tidak valid'), { status: 400 });
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================ autentikasi ============================ */

const sessions = new Map(); // token -> expiry (ms)
const SESSION_MS = 7 * 24 * 3600 * 1000;
const loginFails = new Map(); // ip -> { n, until }

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAdmin(req) {
  const t = parseCookies(req).sid;
  if (!t) return false;
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(t);
    return false;
  }
  return true;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Wajib untuk semua request yang mengubah data: header kustom menolak form lintas-situs. */
function csrfOk(req) {
  return req.headers['x-requested-with'] === 'fetch';
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    fail(res, 401, 'Silakan masuk terlebih dahulu');
    return false;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !csrfOk(req)) {
    fail(res, 403, 'Permintaan ditolak');
    return false;
  }
  return true;
}

/* ============================== static ============================== */

function serveFile(req, res, filePath, { immutable = false } = {}) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Tidak ditemukan');
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const base = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (req.headers['if-none-match'] === etag) return send(res, 304, null, base);

    let start = 0;
    let end = st.size - 1;
    let status = 200;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m && (m[1] || m[2])) {
        if (m[1] === '') {
          start = Math.max(0, st.size - +m[2]);
        } else {
          start = +m[1];
          if (m[2]) end = Math.min(end, +m[2]);
        }
        if (start > end || start >= st.size) {
          return send(res, 416, null, { ...base, 'Content-Range': `bytes */${st.size}` });
        }
        status = 206;
        base['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      }
    }
    base['Content-Length'] = end - start + 1;
    res.writeHead(status, {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': CSP,
      ...base,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath, { start, end })
      .on('error', () => res.destroy())
      .pipe(res);
  });
}

function resolveInside(baseDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (_) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(baseDir, '.' + path.posix.normalize('/' + decoded));
  if (full !== baseDir && !full.startsWith(baseDir + path.sep)) return null;
  if (full.split(path.sep).some((seg) => seg.startsWith('.') && seg.length > 1)) return null; // tanpa dotfile
  return full;
}

/* =========================== halaman undangan =========================== */

const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function longDate(e) {
  const [y, m, d] = e.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${e.day || dayFmt.format(dt)}, ${dateFmt.format(dt)}`;
}

function renderInvitationPage(req, res, slug, wantPreview) {
  let html;
  try {
    html = fs.readFileSync(path.join(PUBLIC_DIR, 'invitation', 'index.html'), 'utf8');
  } catch (_) {
    return fail(res, 500, 'Template tidak ditemukan');
  }
  const rec = store.getInvitationBySlug(slug);
  const preview = wantPreview && isAdmin(req);
  const content = rec && (preview ? rec.draft : rec.status === 'published' ? rec.live : null);
  let title = 'Undangan';
  let og = '';
  if (content) {
    const e = content.event;
    title = `${e.title} — Undangan`;
    const desc = `Anda diundang ke ${e.type ? e.type.toLowerCase() : 'acara'} ${e.title} pada ${longDate(e)}.`;
    const img = content.media.poster || (content.gallery && content.gallery[0]) || '';
    const abs = img ? (img.startsWith('/') ? origin(req) + img : img) : '';
    og =
      `<meta property="og:type" content="website">\n` +
      `<meta property="og:title" content="${esc(e.title)}">\n` +
      `<meta property="og:description" content="${esc(desc)}">\n` +
      (abs && !abs.endsWith('.svg') ? `<meta property="og:image" content="${esc(abs)}">\n` : '') +
      `<meta name="description" content="${esc(desc)}">\n` +
      `<meta name="theme-color" content="${esc(content.theme.background)}">\n`;
  }
  html = html.replace('<!--TITLE-->', esc(title)).replace('<!--OG-->', og);
  send(res, content ? 200 : 404, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
}

/* ============================ upload (multipart) ============================ */

function parseMultipart(buf, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // penutup --
    if (buf[pos] === 0x0d) pos += 2; // CRLF
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const head = buf.slice(pos, headEnd).toString('utf8');
    const next = buf.indexOf(delim, headEnd + 4);
    if (next === -1) break;
    const data = buf.slice(headEnd + 4, next - 2); // buang CRLF sebelum boundary
    const disp = /content-disposition:[^\r\n]*/i.exec(head);
    const name = disp && /name="([^"]*)"/i.exec(disp[0]);
    const fn = disp && /filename="([^"]*)"/i.exec(disp[0]);
    parts.push({ name: name ? name[1] : '', filename: fn ? fn[1] : undefined, data });
    pos = next;
  }
  return parts;
}

/** Deteksi tipe file dari isinya (bukan dari nama/ekstensi yang bisa dipalsukan). */
function sniff(b) {
  const s4 = b.slice(0, 4).toString('latin1');
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', ext: '.jpg' };
  if (b[0] === 0x89 && s4.slice(1) === 'PNG') return { kind: 'image', ext: '.png' };
  if (s4 === 'GIF8') return { kind: 'image', ext: '.gif' };
  if (s4 === 'RIFF') {
    const t = b.slice(8, 12).toString('latin1');
    if (t === 'WEBP') return { kind: 'image', ext: '.webp' };
    if (t === 'WAVE') return { kind: 'audio', ext: '.wav' };
  }
  if (b.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = b.slice(8, 12).toString('latin1');
    if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', ext: '.m4a' };
    if (brand === 'qt  ') return { kind: 'video', ext: '.mov' };
    return { kind: 'video', ext: '.mp4' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: 'video', ext: '.webm', alsoAudio: true };
  if (s4 === 'OggS') return { kind: 'audio', ext: '.ogg' };
  if (s4.slice(0, 3) === 'ID3') return { kind: 'audio', ext: '.mp3' };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { kind: 'audio', ext: (b[1] & 0xf6) === 0xf0 ? '.aac' : '.mp3' };
  return null;
}

async function handleUpload(req, res, url) {
  const kind = url.searchParams.get('kind');
  if (!UPLOAD_LIMITS[kind]) return fail(res, 400, 'Jenis upload tidak dikenal');
  const m = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.headers['content-type'] || '');
  if (!m) return fail(res, 400, 'Gunakan multipart/form-data');
  const limit = UPLOAD_LIMITS[kind];
  const declared = +req.headers['content-length'];
  if (declared && declared > limit + MB) return fail(res, 413, `File terlalu besar (maks ${Math.round(limit / MB)} MB)`);

  const buf = await readBody(req, limit + MB);
  const file = parseMultipart(buf, m[1] || m[2]).find((p) => p.filename !== undefined && p.data.length);
  if (!file) return fail(res, 400, 'File tidak ditemukan');
  if (file.data.length > limit) return fail(res, 413, `File terlalu besar (maks ${Math.round(limit / MB)} MB)`);

  const t = sniff(file.data);
  const okType = t && (t.kind === kind || (kind === 'audio' && t.alsoAudio));
  if (!okType) {
    const hint = { video: 'MP4 / WebM / MOV', audio: 'MP3 / M4A / OGG / WAV', image: 'JPG / PNG / WebP / GIF' }[kind];
    return fail(res, 415, `Format file tidak didukung. Gunakan ${hint}.`);
  }
  const name = crypto.randomBytes(8).toString('hex') + t.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  json(res, 201, { url: `/uploads/${name}`, size: file.data.length, kind });
}

/* ================================ RSVP ================================ */

const rateMap = new Map(); // `${ip}:${invId}` -> [timestamps]
function rateLimited(key, minGapMs, maxPerHour) {
  const now = Date.now();
  const arr = (rateMap.get(key) || []).filter((t) => now - t < 3600 * 1000);
  const limited = (arr.length && now - arr[arr.length - 1] < minGapMs) || arr.length >= maxPerHour;
  if (!limited) arr.push(now);
  rateMap.set(key, arr);
  return limited;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (!v.some((t) => now - t < 3600 * 1000)) rateMap.delete(k);
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
}, 10 * 60 * 1000).unref();

function summarizeRsvps(list) {
  const s = { hadir: 0, tidak: 0, ragu: 0, guests: 0, total: list.length, wishes: 0 };
  for (const r of list) {
    s[r.attendance] = (s[r.attendance] || 0) + 1;
    if (r.attendance === 'hadir') s.guests += r.guests;
    if (r.message) s.wishes++;
  }
  return s;
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel
  return `"${s.replace(/"/g, '""')}"`;
}

/* ================================ router ================================ */

function publicView(rec, preview) {
  const content = preview ? rec.draft : rec.live;
  return { slug: rec.slug, preview: !!preview, ...content };
}

function summary(rec) {
  const rs = store.listRsvps(rec.id);
  const strip = (c) => {
    if (!c) return '';
    return JSON.stringify(c);
  };
  return {
    id: rec.id,
    slug: rec.slug,
    status: rec.status,
    title: rec.draft.event.title,
    type: rec.draft.event.type,
    date: rec.draft.event.date,
    poster: rec.draft.media.poster || rec.draft.gallery[0] || '',
    hasUnpublished: rec.status === 'published' && strip(rec.draft) !== strip(rec.live),
    updatedAt: rec.updatedAt,
    publishedAt: rec.publishedAt || null,
    rsvp: summarizeRsvps(rs),
  };
}

function uniqueSlug(base, exceptId) {
  let s = base || 'undangan';
  let n = 2;
  while (store.slugTaken(s, exceptId)) s = `${base}-${n++}`.slice(0, 60);
  return s;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  /* ---------- halaman ---------- */
  if (method === 'GET' || method === 'HEAD') {
    if (p === '/') {
      return send(res, 302, null, { Location: '/admin' });
    }
    let m = /^\/undangan\/([^/]+)\/?$/.exec(p);
    if (m) return renderInvitationPage(req, res, decodeURIComponent(m[1]).toLowerCase(), url.searchParams.get('preview') === '1');
    if (p === '/admin' || p === '/admin/') return serveFile(req, res, path.join(PUBLIC_DIR, 'admin', 'index.html'));

    if (p.startsWith('/uploads/')) {
      const f = resolveInside(UPLOAD_DIR, p.slice('/uploads/'.length));
      return f ? serveFile(req, res, f, { immutable: true }) : fail(res, 404, 'Tidak ditemukan');
    }
    if (!p.startsWith('/api/')) {
      const f = resolveInside(PUBLIC_DIR, p);
      if (f) return serveFile(req, res, f);
      return fail(res, 404, 'Tidak ditemukan');
    }
  }

  /* ---------- API publik ---------- */
  let m = /^\/api\/invitations\/([a-z0-9-]+)$/.exec(p);
  if (m && method === 'GET') {
    const rec = store.getInvitationBySlug(m[1]);
    const preview = url.searchParams.get('preview') === '1' && isAdmin(req);
    if (!rec || (!preview && rec.status !== 'published')) return fail(res, 404, 'Undangan tidak ditemukan');
    return json(res, 200, publicView(rec, preview));
  }

  m = /^\/api\/invitations\/([a-z0-9-]+)\/wishes$/.exec(p);
  if (m) {
    const rec = store.getInvitationBySlug(m[1]);
    if (!rec || rec.status !== 'published') return fail(res, 404, 'Undangan tidak ditemukan');
    if (method === 'GET') {
      const all = store.listRsvps(rec.id);
      const sum = summarizeRsvps(all);
      const items = rec.live.rsvp.showWishes
        ? all
            .filter((r) => r.message)
            .slice(0, 100)
            .map((r) => ({ name: r.name, attendance: r.attendance, message: r.message, createdAt: r.createdAt }))
        : [];
      return json(res, 200, { items, summary: { hadir: sum.hadir, tidak: sum.tidak, ragu: sum.ragu } });
    }
    if (method === 'POST') {
      const body = await readJson(req, 20 * 1024);
      if (body.website) return json(res, 201, { ok: true }); // honeypot: pura-pura sukses untuk bot
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const message = String(body.message || '').trim().slice(0, 500);
      const attendance = ['hadir', 'tidak', 'ragu'].includes(body.attendance) ? body.attendance : null;
      if (!name) return fail(res, 400, 'Nama wajib diisi');
      if (!attendance) return fail(res, 400, 'Pilih konfirmasi kehadiran');
      const max = rec.live.rsvp.maxGuests;
      const guests = attendance === 'hadir' ? Math.min(max, Math.max(1, Math.round(+body.guests || 1))) : 0;
      if (rateLimited(`${clientIp(req)}:${rec.id}`, 15 * 1000, 6)) {
        return fail(res, 429, 'Terlalu cepat. Coba lagi sebentar lagi.');
      }
      const r = store.insertRsvp({
        id: store.id(),
        invitationId: rec.id,
        name,
        attendance,
        guests,
        message,
        createdAt: new Date().toISOString(),
      });
      return json(res, 201, { ok: true, item: { name: r.name, attendance: r.attendance, message: r.message, createdAt: r.createdAt } });
    }
  }

  /* ---------- login ---------- */
  if (p === '/api/admin/login' && method === 'POST') {
    if (!csrfOk(req)) return fail(res, 403, 'Permintaan ditolak');
    const ip = clientIp(req);
    const lock = loginFails.get(ip);
    if (lock && lock.until > Date.now()) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi 1 menit lagi.');
    const body = await readJson(req, 4 * 1024);
    if (!safeEqual(body.password || '', ADMIN_PASSWORD)) {
      const n = (lock ? lock.n : 0) + 1;
      loginFails.set(ip, { n, until: n >= 5 ? Date.now() + 60 * 1000 : 0 });
      return fail(res, 401, 'Password salah');
    }
    loginFails.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    const cookie = `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? '; Secure' : ''}`;
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (p === '/api/admin/logout' && method === 'POST') {
    const t = parseCookies(req).sid;
    if (t) sessions.delete(t);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (p === '/api/admin/me' && method === 'GET') {
    return json(res, 200, { admin: isAdmin(req), defaultPassword: ADMIN_PASSWORD === 'admin123' });
  }

  /* ---------- API admin ---------- */
  if (p.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;

    if (p === '/api/admin/upload' && method === 'POST') return handleUpload(req, res, url);

    if (p === '/api/admin/invitations') {
      if (method === 'GET') {
        const list = store.listInvitations().map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return json(res, 200, list);
      }
      if (method === 'POST') {
        const body = await readJson(req);
        const title = String(body.title || '').trim().slice(0, 120);
        if (!title) return fail(res, 400, 'Nama undangan wajib diisi');
        let slug;
        if (body.slug) {
          slug = slugify(body.slug);
          if (!SLUG_RE.test(slug)) return fail(res, 400, 'Link hanya boleh huruf kecil, angka, dan tanda hubung (min. 2 karakter)');
          if (store.slugTaken(slug)) return fail(res, 409, 'Link sudah dipakai undangan lain');
        } else {
          slug = uniqueSlug(slugify(title));
          if (!SLUG_RE.test(slug)) slug = uniqueSlug('undangan');
        }
        let content;
        if (body.copyFrom) {
          const src = store.getInvitation(String(body.copyFrom));
          if (!src) return fail(res, 404, 'Undangan sumber tidak ditemukan');
          content = JSON.parse(JSON.stringify(src.draft));
          content.event.title = title;
        } else {
          content = makeInvitation({ title });
        }
        const now = new Date().toISOString();
        const rec = store.insertInvitation({
          id: store.id(),
          slug,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          draft: content,
          live: null,
        });
        return json(res, 201, rec);
      }
    }

    m = /^\/api\/admin\/invitations\/([a-f0-9]+)$/.exec(p);
    if (m) {
      const rec = store.getInvitation(m[1]);
      if (!rec) return fail(res, 404, 'Undangan tidak ditemukan');
      if (method === 'GET') return json(res, 200, { ...rec, hasUnpublished: summary(rec).hasUnpublished });
      if (method === 'PUT') {
        const body = await readJson(req, 2 * MB);
        const patch = { draft: sanitizeInvitation(body.draft, rec.draft), updatedAt: new Date().toISOString() };
        if (body.slug !== undefined && body.slug !== rec.slug) {
          const slug = slugify(body.slug);
          if (!SLUG_RE.test(slug)) return fail(res, 400, 'Link hanya boleh huruf kecil, angka, dan tanda hubung (min. 2 karakter)');
          if (store.slugTaken(slug, rec.id)) return fail(res, 409, 'Link sudah dipakai undangan lain');
          patch.slug = slug;
        }
        const saved = store.updateInvitation(rec.id, patch);
        return json(res, 200, { ...saved, hasUnpublished: summary(saved).hasUnpublished });
      }
      if (method === 'DELETE') {
        store.deleteInvitation(rec.id);
        return json(res, 200, { ok: true });
      }
    }

    m = /^\/api\/admin\/invitations\/([a-f0-9]+)\/publish$/.exec(p);
    if (m && method === 'POST') {
      const rec = store.getInvitation(m[1]);
      if (!rec) return fail(res, 404, 'Undangan tidak ditemukan');
      const body = await readJson(req, 4 * 1024);
      const publish = body.published !== false;
      const now = new Date().toISOString();
      const saved = publish
        ? store.updateInvitation(rec.id, { status: 'published', live: rec.draft, publishedAt: now, updatedAt: now })
        : store.updateInvitation(rec.id, { status: 'draft', updatedAt: now });
      return json(res, 200, { ...saved, hasUnpublished: summary(saved).hasUnpublished });
    }

    m = /^\/api\/admin\/invitations\/([a-f0-9]+)\/rsvps(\.csv)?$/.exec(p);
    if (m && method === 'GET') {
      const rec = store.getInvitation(m[1]);
      if (!rec) return fail(res, 404, 'Undangan tidak ditemukan');
      const list = store.listRsvps(rec.id);
      if (m[2]) {
        const label = { hadir: 'Hadir', tidak: 'Tidak hadir', ragu: 'Masih ragu' };
        const rows = [['Nama', 'Kehadiran', 'Jumlah tamu', 'Ucapan', 'Waktu']].concat(
          list.map((r) => [r.name, label[r.attendance], r.guests, r.message, r.createdAt])
        );
        const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
        return send(res, 200, csv, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="rsvp-${rec.slug}.csv"`,
          'Cache-Control': 'no-store',
        });
      }
      return json(res, 200, { items: list, summary: summarizeRsvps(list) });
    }

    m = /^\/api\/admin\/invitations\/([a-f0-9]+)\/rsvps\/([a-f0-9]+)$/.exec(p);
    if (m && method === 'DELETE') {
      return store.deleteRsvp(m[1], m[2]) ? json(res, 200, { ok: true }) : fail(res, 404, 'Data tidak ditemukan');
    }
  }

  return fail(res, 404, 'Tidak ditemukan');
}

/* ================================ start ================================ */

const isNew = store.load();
if (isNew) {
  const now = new Date().toISOString();
  const content = makeInvitation({ title: 'Sandy & Kala' });
  store.insertInvitation({
    id: store.id(),
    slug: 'sandy-kala',
    status: 'published',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    draft: content,
    live: JSON.parse(JSON.stringify(content)),
  });
  console.log('Database baru dibuat dengan undangan contoh: /undangan/sandy-kala');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (res.headersSent) return res.destroy();
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    fail(res, status, status >= 500 ? 'Terjadi kesalahan di server' : err.message);
  });
});
server.requestTimeout = 10 * 60 * 1000; // upload video di koneksi lambat

server.listen(PORT, () => {
  console.log(`\nUndangan Online berjalan di http://localhost:${PORT}`);
  console.log(`  Dashboard : http://localhost:${PORT}/admin`);
  console.log(`  Contoh    : http://localhost:${PORT}/undangan/sandy-kala`);
  if (ADMIN_PASSWORD === 'admin123') {
    console.log('\n  ⚠  Memakai password bawaan "admin123". Ganti dengan: ADMIN_PASSWORD="passwordkuat" node server.js\n');
  }
});
