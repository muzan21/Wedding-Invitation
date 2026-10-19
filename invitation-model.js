'use strict';
/**
 * Model data undangan.
 *  - makeInvitation(): ISI undangan contoh (dummy) untuk undangan baru
 *  - sanitizeInvitation(): memvalidasi semua input dari dashboard
 *
 * Satu record undangan = { id, slug, status, draft, live, ... }.
 *  - draft : isi yang sedang diedit (dilihat di Preview)
 *  - live  : isi yang sudah dipublikasikan (dilihat tamu)
 *
 * Template (public/invitation/*) hanya MEMBACA data ini. Mengubah data
 * di dashboard otomatis mengubah tampilan undangan — tanpa menyentuh kode.
 */

const FONT_PRESETS = ['modern', 'klasik', 'romantis'];
const COVER_MODES = ['brief', 'full', 'button'];
const TIMEZONES = ['WIB', 'WITA', 'WIT'];

function makeInvitation({ title = 'Sandy & Kala' } = {}) {
  return {
    template: 'bunga',
    event: {
      type: 'Pernikahan',
      title,
      subtitle: 'The Wedding of',
      date: '2026-12-20',
      day: '', // kosong = otomatis dari tanggal
      time: '10:00',
      endTime: '13:00',
      tz: 'WIB',
      venue: 'Gedung Serbaguna Taman Melati',
      address: 'Jl. Melati Raya No. 12, Jakarta Selatan',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Gedung+Serbaguna+Taman+Melati+Jakarta',
      schedule: [
        { label: 'Akad Nikah', time: '10.00' },
        { label: 'Resepsi', time: '11.30' },
      ],
    },
    people: [
      {
        role: 'Mempelai Pria',
        name: 'Sandy Pratama',
        parents: 'Putra dari Bapak Hendra Pratama & Ibu Ratna Dewi',
        photo: '/demo/mempelai-1.svg',
        bio: '',
      },
      {
        role: 'Mempelai Wanita',
        name: 'Kala Anindya',
        parents: 'Putri dari Bapak Surya Anindya & Ibu Lestari Wulan',
        photo: '/demo/mempelai-2.svg',
        bio: '',
      },
    ],
    story:
      'Kami bertemu di sebuah sore yang biasa saja, di toko buku kecil dekat kampus. Dari percakapan singkat tentang buku favorit, tumbuh cerita yang kini kami rayakan bersama.\n\nSetelah bertahun-tahun saling menemani, kami memutuskan untuk melangkah ke jenjang berikutnya. Kehadiran dan doa Anda akan menjadikan hari itu lebih berarti.',
    texts: {
      guestLabel: 'Kepada Yth.',
      opening: 'Dengan penuh syukur dan bahagia',
      welcome:
        'Kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada hari pernikahan kami.',
      closing:
        'Merupakan kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu. Terima kasih atas segala perhatian dan doa yang diberikan.',
      rsvpIntro: 'Mohon konfirmasi kehadiran Anda dan tinggalkan ucapan untuk kami.',
    },
    headings: {
      people: 'Mempelai',
      story: 'Cerita Kami',
      event: 'Detail Acara',
      gallery: 'Galeri',
      extra: 'Informasi Tambahan',
      rsvp: 'Konfirmasi & Ucapan',
    },
    extra: [
      { title: 'Dress code', text: 'Warna pastel: pink, sage, atau putih.' },
      {
        title: 'Hadiah',
        text: 'Doa restu Anda adalah hadiah terbaik. Bila ingin berbagi kasih, tersedia kotak amplop di lokasi acara.',
      },
      { title: 'Parkir', text: 'Area parkir tersedia di basement dan halaman depan gedung.' },
    ],
    gallery: [1, 2, 3, 4, 5, 6].map((n) => `/demo/foto-${n}.svg`),
    media: {
      video: '/uploads/cover-demo.mp4',
      poster: '/uploads/cover-demo-poster.jpg',
      music: '/uploads/music-demo.m4a',
      musicTitle: 'Musik latar',
    },
    cover: {
      mode: 'brief', // brief: tamu + tanggal + tombol (video sudah memuat nama) | full | button
      tone: 'light',
      bg: '#ffffff',
      buttonLabel: 'Buka Undangan',
    },
    theme: {
      primary: '#3f7a4d',
      accent: '#b94d76',
      background: '#fffafb',
      text: '#463f44',
      font: 'modern',
    },
    sections: { people: true, story: true, countdown: true, gallery: true, extra: true, rsvp: true },
    rsvp: { maxGuests: 5, showWishes: true },
  };
}

/* ---------- sanitasi ---------- */

const str = (v, max, fb = '') => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : fb);
const bool = (v, fb) => (typeof v === 'boolean' ? v : fb);
const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);
const color = (v, fb) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fb);
const date = (v, fb) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : fb);
const time = (v, fb) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : v === '' ? '' : fb);
const int = (v, min, max, fb) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.round(+v))) : fb);

/** URL media: file lokal (/uploads, /demo) atau https:// eksternal. */
function mediaUrl(v, fb = '') {
  if (v === '') return '';
  if (typeof v !== 'string') return fb;
  if (/^\/(uploads|demo)\/[A-Za-z0-9._-]+$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return u.href.slice(0, 1000);
  } catch (_) {}
  return fb;
}

/** Link web biasa (Google Maps): hanya http/https. */
function webUrl(v, fb = '') {
  if (v === '') return '';
  if (typeof v !== 'string') return fb;
  try {
    const u = new URL(v.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href.slice(0, 1500);
  } catch (_) {}
  return fb;
}

const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function sanitizeInvitation(input, base) {
  const i = input && typeof input === 'object' ? input : {};
  const b = base;
  const e = i.event || {};
  const be = b.event;

  const out = { ...b };

  out.event = {
    type: str(e.type, 60, be.type),
    title: str(e.title, 120, be.title) || be.title,
    subtitle: str(e.subtitle, 120, be.subtitle),
    date: date(e.date, be.date),
    day: str(e.day, 20, be.day),
    time: time(e.time, be.time),
    endTime: time(e.endTime, be.endTime),
    tz: oneOf(e.tz, TIMEZONES, be.tz),
    venue: str(e.venue, 160, be.venue),
    address: str(e.address, 400, be.address),
    mapsUrl: webUrl(e.mapsUrl, be.mapsUrl),
    schedule: e.schedule
      ? list(e.schedule, 10)
          .map((s) => ({ label: str(s && s.label, 80), time: str(s && s.time, 40) }))
          .filter((s) => s.label || s.time)
      : be.schedule,
  };

  out.people = i.people
    ? list(i.people, 4).map((p) => ({
        role: str(p && p.role, 60),
        name: str(p && p.name, 120),
        parents: str(p && p.parents, 240),
        photo: mediaUrl(p && p.photo),
        bio: str(p && p.bio, 800),
      }))
    : b.people;

  out.story = typeof i.story === 'string' ? str(i.story, 4000) : b.story;

  
const t = i.texts || {};
out.texts = {
  guestLabel: str(t.guestLabel, 60, b.texts.guestLabel),
  opening: str(t.opening, 2000, b.texts.opening),
  welcome: str(t.welcome, 5000, b.texts.welcome),
  closing: str(t.closing, 5000, b.texts.closing),
  rsvpIntro: str(t.rsvpIntro, 2000, b.texts.rsvpIntro),
};


  const h = i.headings || {};
  out.headings = {};
  for (const k of Object.keys(b.headings)) out.headings[k] = str(h[k], 60, b.headings[k]);

  out.extra = i.extra
    ? list(i.extra, 12)
        .map((x) => ({ title: str(x && x.title, 80), text: str(x && x.text, 600) }))
        .filter((x) => x.title || x.text)
    : b.extra;

  out.gallery = i.gallery ? list(i.gallery, 40).map((u) => mediaUrl(u)).filter(Boolean) : b.gallery;

  const m = i.media || {};
  out.media = {
    video: m.video !== undefined ? mediaUrl(m.video, b.media.video) : b.media.video,
    poster: m.poster !== undefined ? mediaUrl(m.poster, b.media.poster) : b.media.poster,
    music: m.music !== undefined ? mediaUrl(m.music, b.media.music) : b.media.music,
    musicTitle: str(m.musicTitle, 100, b.media.musicTitle),
  };

  const c = i.cover || {};
  out.cover = {
    mode: oneOf(c.mode, COVER_MODES, b.cover.mode),
    tone: oneOf(c.tone, ['light', 'dark'], b.cover.tone),
    bg: color(c.bg, b.cover.bg),
    buttonLabel: str(c.buttonLabel, 40, b.cover.buttonLabel) || 'Buka Undangan',
  };

  const th = i.theme || {};
  out.theme = {
    primary: color(th.primary, b.theme.primary),
    accent: color(th.accent, b.theme.accent),
    background: color(th.background, b.theme.background),
    text: color(th.text, b.theme.text),
    font: oneOf(th.font, FONT_PRESETS, b.theme.font),
  };

  const s = i.sections || {};
  out.sections = {};
  for (const k of Object.keys(b.sections)) out.sections[k] = bool(s[k], b.sections[k]);

  const r = i.rsvp || {};
  out.rsvp = {
    maxGuests: int(r.maxGuests, 1, 500, b.rsvp.maxGuests),
    showWishes: bool(r.showWishes, b.rsvp.showWishes),
  };

  return out;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

module.exports = { makeInvitation, sanitizeInvitation, slugify, SLUG_RE };
