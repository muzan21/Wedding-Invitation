/* ==========================================================================
   Template undangan — merender halaman HANYA dari data undangan (JSON).
   Mode normal : data diambil dari /api/invitations/:slug
   Mode embed  : (?embed=1) data dikirim editor lewat postMessage → preview langsung
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- util */
  const params = new URLSearchParams(location.search);
  const SLUG = decodeURIComponent((location.pathname.match(/^\/undangan\/([^/]+)/) || [])[1] || '').toLowerCase();
  const EMBED = params.get('embed') === '1';
  const PREVIEW = params.get('preview') === '1' || EMBED;
  const GUEST = (params.get('to') || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  const app = document.getElementById('app');
  const body = document.body;
  const root = document.documentElement;

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function svg(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  }

  const ICON = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    music: '<svg class="note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  };
  const icon = (n) => svg(ICON[n]);

  function sprig() {
    let leaves = '';
    [28, 44, 60, 76, 92].forEach((x) => {
      leaves += `<ellipse cx="${x}" cy="12" rx="3.2" ry="7" transform="rotate(-35 ${x} 12)" fill="currentColor" opacity=".85"/>`;
      leaves += `<ellipse cx="${x + 6}" cy="24" rx="3.2" ry="7" transform="rotate(35 ${x + 6} 24)" fill="currentColor" opacity=".85"/>`;
    });
    return svg(
      `<svg class="sprig" viewBox="0 0 140 36" aria-hidden="true"><path d="M10 18H118" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/>${leaves}` +
        `<ellipse cx="123" cy="18" rx="2.4" ry="3.4" fill="var(--accent)"/><ellipse cx="129" cy="18" rx="2.4" ry="3.4" fill="var(--accent)"/><ellipse cx="135" cy="18" rx="2.4" ry="3.4" fill="var(--accent)"/></svg>`
    );
  }

  /* ----------------------------------------------------- tema & font */
  const FONTS = {
    modern: {
      display: "'Instrument Serif', Georgia, 'Times New Roman', serif",
      body: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap',
    },
    klasik: {
      display: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
      body: "'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600&display=swap',
    },
    romantis: {
      display: "'Playfair Display', Georgia, 'Times New Roman', serif",
      body: "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600&family=Playfair+Display:ital,wght@0,400;0,500;1,400&display=swap',
    },
  };

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function applyTheme(d) {
    const t = d.theme;
    const f = FONTS[t.font] || FONTS.modern;
    const s = root.style;
    s.setProperty('--primary', t.primary);
    s.setProperty('--accent', t.accent);
    s.setProperty('--bg', t.background);
    s.setProperty('--text', t.text);
    s.setProperty('--cover-bg', d.cover.bg);
    s.setProperty('--font-display', f.display);
    s.setProperty('--font-body', f.body);
    // teks tombol otomatis putih atau gelap, mana yang kontrasnya cukup
    const whiteContrast = 1.05 / (luminance(t.accent) + 0.05);
    s.setProperty('--on-accent', whiteContrast >= 4.5 ? '#ffffff' : '#1d171b');

    let link = document.getElementById('font-preset');
    if (!link) {
      link = h('link', { rel: 'stylesheet', id: 'font-preset' });
      document.head.append(link);
    }
    if (link.getAttribute('href') !== f.href) link.setAttribute('href', f.href);

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) document.head.append((meta = h('meta', { name: 'theme-color' })));
    meta.setAttribute('content', t.background);
  }

  /* ----------------------------------------------------- tanggal & waktu */
  const TZ_OFFSET = { WIB: '+07:00', WITA: '+08:00', WIT: '+09:00' };
  const fmtDay = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' });
  const fmtDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function utcDate(e) {
    const [y, m, d] = e.date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const dateLong = (e) => {
    const dt = utcDate(e);
    if (isNaN(dt)) return ''; // tanggal dikosongkan di editor
    return `${e.day || fmtDay.format(dt)}, ${fmtDate.format(dt)}`;
  };
  const clock = (t) => t.replace(':', '.');
  function timeText(e) {
    if (!e.time) return '';
    return e.endTime ? `Pukul ${clock(e.time)} – ${clock(e.endTime)} ${e.tz}` : `Pukul ${clock(e.time)} ${e.tz} – selesai`;
  }
  const startMs = (e) => Date.parse(`${e.date}T${e.time || '00:00'}:00${TZ_OFFSET[e.tz] || '+07:00'}`);

  function calendarUrl(e) {
    const start = startMs(e);
    let end = e.endTime ? Date.parse(`${e.date}T${e.endTime}:00${TZ_OFFSET[e.tz] || '+07:00'}`) : start + 3 * 3600e3;
    if (!(end > start)) end = start + 3 * 3600e3;
    const f = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return 'https://calendar.google.com/calendar/render?' + q({
      action: 'TEMPLATE',
      text: e.title,
      dates: `${f(start)}/${f(end)}`,
      location: [e.venue, e.address].filter(Boolean).join(', '),
    });
  }

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
    if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} hari lalu`;
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  }

  /* ------------------------------------------------------------ state */
  const state = { data: null, opened: false, musicWanted: false, resumeAfterHide: false };
  let coverKey = '';
  let coverEl = null;
  let pageEl = null;
  let bootDone = false;
  const sectionNodes = new Map(); // id -> { key, node }

  function hideBoot() {
    if (bootDone) return;
    bootDone = true;
    body.classList.remove('is-loading');
  }

  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (en.isIntersecting) {
                en.target.classList.add('in');
                io.unobserve(en.target);
              }
            }
          },
          { threshold: 0.06 }
        )
      : null;

  function lazyImg(src, alt) {
    const img = h('img', { alt: alt || '', loading: 'lazy', decoding: 'async' });
    const done = () => img.classList.add('loaded');
    img.addEventListener('load', done);
    img.addEventListener('error', done);
    img.src = src;
    if (img.complete && img.naturalWidth) done();
    return img;
  }

  /* ------------------------------------------------------------ cover */
  function buildCover(d) {
    const { cover: c, event: e, media: m } = d;

    const poster = m.poster ? h('img', { class: 'cover-poster', alt: '', decoding: 'async', fetchpriority: 'high' }) : null;
    if (poster) {
      poster.addEventListener('load', hideBoot);
      poster.addEventListener('error', hideBoot);
      poster.src = m.poster;
    }

    let video = null;
    if (m.video) {
      video = h('video', { class: 'cover-video', muted: true, loop: true, playsinline: true, autoplay: true, preload: 'auto', 'aria-hidden': 'true', disablepictureinpicture: true });
      video.muted = true; // wajib agar autoplay diizinkan browser
      video.addEventListener('playing', () => {
        video.classList.add('is-playing');
        hideBoot();
      });
      video.addEventListener('loadeddata', () => !poster && hideBoot());
      video.addEventListener('error', hideBoot);
      video.src = m.video;
      const p = video.play();
      if (p && p.catch) p.catch(() => {}); // low-power mode: poster tetap tampil
    }
    if (!poster && !video) hideBoot();

    const guest = GUEST
      ? [h('p', { class: 'cover-guest-label' }, d.texts.guestLabel), h('h2', { class: 'cover-guest' }, GUEST)]
      : [];
    const dateLine = dateLong(e) ? h('p', { class: 'cover-date' }, dateLong(e)) : null;
    const btn = h('button', { class: 'btn', type: 'button', id: 'openBtn', onclick: openInvitation }, c.buttonLabel);

    let panel;
    if (c.mode === 'full') {
      panel = [e.subtitle && h('p', { class: 'cover-sub' }, e.subtitle), h('h1', { class: 'cover-title' }, e.title), dateLine, guest.length > 0 && h('div', { style: 'margin-top:1rem' }, guest), btn];
    } else if (c.mode === 'button') {
      panel = [btn];
    } else {
      // "brief": video sudah memuat nama → tampilkan tamu, tanggal, tombol
      panel = [guest, dateLine, btn];
    }

    const el = h(
      'section',
      { class: 'cover', id: 'cover', 'data-tone': c.tone, 'data-mode': c.mode, 'aria-label': `Sampul undangan ${e.title}` },
      h('div', { class: 'cover-media' }, poster, video),
      h('div', { class: 'cover-panel' }, panel)
    );
    // pastikan <h1> hanya satu untuk pembaca layar
    if (c.mode !== 'full') el.setAttribute('role', 'region');
    return el;
  }

  function renderCover(d) {
    const key = JSON.stringify([d.media.video, d.media.poster, d.cover, d.event.title, d.event.subtitle, d.event.date, d.event.day, d.texts.guestLabel]);
    if (key === coverKey && coverEl) return;
    coverKey = key;
    const next = buildCover(d);
    if (coverEl) {
      if (coverEl.classList.contains('is-open')) next.classList.add('is-open');
      if (coverEl.classList.contains('is-gone')) next.classList.add('is-gone');
      coverEl.replaceWith(next);
    } else {
      app.prepend(next);
    }
    coverEl = next;
  }

  /* -------------------------------------------------------- section builders */
  const sec = (cls, ...kids) => h('section', { class: 'sec ' + (cls || '') }, h('div', { class: 'inner' }, kids));
  const paragraphs = (text) => h('div', { class: 'prose' }, String(text).split(/\n{2,}/).map((p) => h('p', null, p.trim())));

  function buildWelcome(d) {
    return sec(
      'welcome',
      d.event.subtitle && h('p', { class: 'lead', style: 'margin-bottom:.4rem' }, d.event.subtitle),
      h('h2', { class: 'names' }, d.event.title),
      d.texts.opening && h('p', { class: 'opening' }, d.texts.opening),
      d.texts.welcome && h('p', { class: 'lead' }, d.texts.welcome),
      sprig()
    );
  }

  function buildPeople(d) {
    const items = [];
    d.people.forEach((p, i) => {
      if (i > 0) items.push(h('p', { class: 'amp', 'aria-hidden': 'true' }, '&'));
      items.push(
        h(
          'article',
          { class: 'person' },
          p.photo && h('div', { class: 'oval' }, lazyImg(p.photo, p.name)),
          p.role && h('p', { class: 'role' }, p.role),
          h('h3', { class: 'pname' }, p.name),
          p.parents && h('p', { class: 'parents' }, p.parents),
          p.bio && h('p', { class: 'bio' }, p.bio)
        )
      );
    });
    return sec('', h('h2', { class: 'h2' }, d.headings.people), items);
  }

  const buildStory = (d) => sec('', h('h2', { class: 'h2' }, d.headings.story), paragraphs(d.story));

  function buildEvent(d) {
    const e = d.event;
    const cd =
      d.sections.countdown && !isNaN(startMs(e))
        ? h(
            'div',
            { class: 'countdown', id: 'countdown', role: 'timer', 'aria-label': 'Hitung mundur menuju acara' },
            h('div', { class: 'countdown-grid' }, [['d', 'Hari'], ['h', 'Jam'], ['m', 'Menit'], ['s', 'Detik']].map(([k, l]) => h('div', null, h('b', { 'data-u': k }, '00'), h('span', null, l))))
          )
        : null;
    return sec(
      'tint',
      h('h2', { class: 'h2' }, d.headings.event),
      dateLong(e) && h('p', { class: 'when' }, dateLong(e)),
      timeText(e) && h('p', { class: 'time' }, timeText(e)),
      cd,
      e.schedule.length > 0 && h('dl', { class: 'schedule' }, e.schedule.map((s) => h('div', null, h('dt', null, s.label), h('dd', null, s.time)))),
      (e.venue || e.address) && h('div', { class: 'venue' }, e.venue && h('strong', null, e.venue), e.address && h('p', null, e.address)),
      h(
        'div',
        { class: 'actions' },
        e.mapsUrl && h('a', { class: 'btn', href: e.mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('pin'), 'Lihat Lokasi'),
        !isNaN(startMs(e)) && h('a', { class: 'btn ghost', href: calendarUrl(e), target: '_blank', rel: 'noopener noreferrer' }, icon('cal'), 'Simpan ke Kalender')
      )
    );
  }

  function buildGallery(d) {
    return sec(
      '',
      h('h2', { class: 'h2' }, d.headings.gallery),
      h(
        'div',
        { class: 'gallery' },
        d.gallery.map((src, i) =>
          h('button', { type: 'button', class: i % 3 === 0 ? 'wide' : '', 'aria-label': `Buka foto ${i + 1} dari ${d.gallery.length}`, onclick: () => openLightbox(i) }, lazyImg(src, `Foto ${i + 1}`))
        )
      )
    );
  }

  function buildExtra(d) {
    return sec('', h('h2', { class: 'h2' }, d.headings.extra), h('div', { class: 'notes' }, d.extra.map((x) => h('div', { class: 'note' }, x.title && h('h3', null, x.title), x.text && h('p', null, x.text)))));
  }

  function buildRsvp(d) {
    const max = d.rsvp.maxGuests;
    let attendance = null;
    let guests = 1;

    const nameIn = h('input', { class: 'input', id: 'rsvp-name', name: 'name', maxlength: 80, autocomplete: 'name', required: true, value: GUEST });
    const msgIn = h('textarea', { class: 'input', id: 'rsvp-msg', name: 'message', maxlength: 500, rows: 4, placeholder: 'Tulis doa dan ucapan Anda' });
    const counter = h('p', { class: 'counter' }, '0 / 500');
    msgIn.addEventListener('input', () => (counter.textContent = `${msgIn.value.length} / 500`));

    const out = h('output', { 'aria-live': 'polite' }, '1');
    const minus = h('button', { type: 'button', 'aria-label': 'Kurangi jumlah tamu', disabled: true }, '−');
    const plus = h('button', { type: 'button', 'aria-label': 'Tambah jumlah tamu' }, '+');
    const sync = () => {
      out.textContent = guests;
      minus.disabled = guests <= 1;
      plus.disabled = guests >= max;
    };
    minus.onclick = () => { guests = Math.max(1, guests - 1); sync(); };
    plus.onclick = () => { guests = Math.min(max, guests + 1); sync(); };
    sync();
    const guestField = h('div', { class: 'field', hidden: true }, h('span', { class: 'label' }, `Jumlah tamu (maks. ${max})`), h('div', { class: 'stepper' }, minus, out, plus));

    const choices = [['hadir', 'Hadir'], ['tidak', 'Tidak hadir'], ['ragu', 'Masih ragu']].map(([v, t]) => {
      const input = h('input', { type: 'radio', name: 'attendance', value: v });
      input.addEventListener('change', () => {
        attendance = v;
        guestField.hidden = v !== 'hadir';
      });
      return h('label', { class: 'choice' }, input, h('span', null, t));
    });

    const msg = h('p', { class: 'form-msg', role: 'status' });
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Kirim Konfirmasi');
    const honeypot = h('div', { class: 'hp', 'aria-hidden': 'true' }, h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }));

    const form = h(
      'form',
      { class: 'form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'rsvp-name' }, 'Nama'), nameIn),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Konfirmasi kehadiran'), h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Konfirmasi kehadiran' }, choices)),
      guestField,
      h('div', { class: 'field' }, h('label', { for: 'rsvp-msg' }, 'Ucapan'), msgIn, counter),
      honeypot,
      msg,
      submit
    );

    const holder = h('div', null, form);

    function showThanks(item) {
      const word = { hadir: 'Kami menantikan kehadiran Anda.', tidak: 'Terima kasih sudah memberi kabar.', ragu: 'Kabari kami bila sudah dipastikan ya.' }[item.attendance];
      const again = h('button', { class: 'btn ghost', type: 'button' }, 'Kirim ucapan lain');
      const box = h('div', { class: 'thanks', role: 'status' }, h('h3', null, 'Terima kasih'), h('p', null, word), PREVIEW ? h('p', { style: 'font-size:.85rem' }, 'Pratinjau: data ini tidak dikirim.') : null, again);
      again.onclick = () => {
        msgIn.value = '';
        counter.textContent = '0 / 500';
        holder.replaceChildren(form);
      };
      holder.replaceChildren(box);
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      msg.className = 'form-msg';
      msg.textContent = '';
      const name = nameIn.value.trim();
      if (!name) { msg.className = 'form-msg err'; msg.textContent = 'Nama wajib diisi.'; nameIn.focus(); return; }
      if (!attendance) { msg.className = 'form-msg err'; msg.textContent = 'Pilih konfirmasi kehadiran Anda.'; return; }
      const payload = { name, attendance, guests: attendance === 'hadir' ? guests : 0, message: msgIn.value.trim(), website: form.elements.website.value };

      if (PREVIEW) {
        const item = { name, attendance, message: payload.message, createdAt: new Date().toISOString() };
        showThanks(item);
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Mengirim…';
      try {
        const res = await fetch(`/api/invitations/${encodeURIComponent(SLUG)}/wishes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Gagal mengirim. Coba lagi.');
        showThanks(j.item || payload);
        loadWishes();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = err.message === 'Failed to fetch' ? 'Koneksi bermasalah. Coba lagi.' : err.message;
      } finally {
        submit.disabled = false;
        submit.textContent = 'Kirim Konfirmasi';
      }
    });

    const wishes = d.rsvp.showWishes
      ? h('div', { class: 'wishes' }, h('h3', null, 'Ucapan Tamu'), h('p', { class: 'tally', id: 'wish-tally' }), h('div', { class: 'wish-list', id: 'wish-list', tabindex: '0', 'aria-label': 'Daftar ucapan tamu' }))
      : null;

    return sec('tint', h('h2', { class: 'h2' }, d.headings.rsvp), d.texts.rsvpIntro && h('p', { class: 'lead' }, d.texts.rsvpIntro), holder, wishes);
  }

  function buildClosing(d) {
    return sec('closing', sprig(), d.texts.closing && h('p', { class: 'lead', style: 'margin-top:1.6rem' }, d.texts.closing), h('p', { class: 'sign' }, d.event.title));
  }

  const SECTIONS = [
    { id: 'welcome', on: () => true, dep: (d) => [d.event.title, d.event.subtitle, d.texts.opening, d.texts.welcome], build: buildWelcome },
    { id: 'people', on: (d) => d.sections.people && d.people.length > 0, dep: (d) => [d.people, d.headings.people], build: buildPeople },
    { id: 'story', on: (d) => d.sections.story && d.story, dep: (d) => [d.story, d.headings.story], build: buildStory },
    { id: 'event', on: () => true, dep: (d) => [d.event, d.headings.event, d.sections.countdown], build: buildEvent },
    { id: 'gallery', on: (d) => d.sections.gallery && d.gallery.length > 0, dep: (d) => [d.gallery, d.headings.gallery], build: buildGallery },
    { id: 'extra', on: (d) => d.sections.extra && d.extra.length > 0, dep: (d) => [d.extra, d.headings.extra], build: buildExtra },
    { id: 'rsvp', on: (d) => d.sections.rsvp, dep: (d) => [d.rsvp, d.headings.rsvp, d.texts.rsvpIntro], build: buildRsvp },
    { id: 'closing', on: () => true, dep: (d) => [d.texts.closing, d.event.title], build: buildClosing },
  ];

  function renderSections(d) {
    if (!pageEl) {
      pageEl = h('main', { class: 'page', id: 'page' });
      if (!state.opened) pageEl.inert = true;
      app.append(pageEl);
    }
    let anchor = null;
    let rsvpChanged = false;
    for (const s of SECTIONS) {
      const wanted = !!s.on(d);
      const cur = sectionNodes.get(s.id);
      if (!wanted) {
        if (cur) { cur.node.remove(); sectionNodes.delete(s.id); }
        continue;
      }
      const key = JSON.stringify(s.dep(d));
      let node = cur && cur.node;
      if (!cur || cur.key !== key) {
        const fresh = s.build(d);
        if (cur) {
          if (cur.node.classList.contains('in')) fresh.classList.add('in'); // jangan berkedip saat diedit
          cur.node.replaceWith(fresh);
        } else {
          pageEl.insertBefore(fresh, anchor ? anchor.nextSibling : pageEl.firstChild);
        }
        node = fresh;
        sectionNodes.set(s.id, { key, node });
        if (io && !fresh.classList.contains('in')) io.observe(fresh);
        else if (!io) fresh.classList.add('in');
        if (s.id === 'rsvp') rsvpChanged = true;
      }
      anchor = node;
    }
    if (rsvpChanged) loadWishes();
    tick();
  }

  /* -------------------------------------------------------------- countdown */
  function tick() {
    const el = document.getElementById('countdown');
    if (!el || !state.data) return;
    const diff = startMs(state.data.event) - Date.now();
    if (diff <= 0) {
      if (!el.dataset.done) {
        el.dataset.done = '1';
        const sameDay = Date.now() - startMs(state.data.event) < 24 * 3600e3;
        el.replaceChildren(h('p', { class: 'countdown-msg' }, sameDay ? 'Hari ini adalah harinya' : 'Acara telah berlangsung'));
      }
      return;
    }
    const v = { d: Math.floor(diff / 86400e3), h: Math.floor((diff / 3600e3) % 24), m: Math.floor((diff / 60e3) % 60), s: Math.floor((diff / 1e3) % 60) };
    for (const b of el.querySelectorAll('[data-u]')) {
      const val = String(v[b.dataset.u]).padStart(2, '0');
      if (b.textContent !== val) b.textContent = val;
    }
  }
  setInterval(tick, 1000);

  /* ------------------------------------------------------------------ musik */
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'none';
  let fab = null;

  function ensureFab() {
    if (fab) return fab;
    fab = h('button', { class: 'music-fab', type: 'button', 'aria-label': 'Putar atau jeda musik', 'aria-pressed': 'false' }, icon('music'), h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    fab.addEventListener('click', () => (audio.paused ? playMusic() : pauseMusic(true)));
    document.body.append(fab);
    return fab;
  }
  function paintFab() {
    if (!fab) return;
    fab.classList.toggle('playing', !audio.paused);
    fab.setAttribute('aria-pressed', String(!audio.paused));
  }
  audio.addEventListener('play', paintFab);
  audio.addEventListener('pause', paintFab);

  function setupMusic(d) {
    ensureFab();
    const src = d.media.music || '';
    const had = audio.getAttribute('src') || '';
    if (src !== had) {
      const wasPlaying = !audio.paused;
      if (src) audio.setAttribute('src', src);
      else { audio.removeAttribute('src'); audio.load(); }
      if (wasPlaying && src) audio.play().catch(() => {});
    }
    fab.classList.toggle('has-music', !!src);
    fab.title = d.media.musicTitle || 'Musik latar';
  }
  let fadeTimer = null;
  function playMusic() {
    if (!audio.getAttribute('src')) return;
    clearInterval(fadeTimer);
    audio.volume = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
    state.musicWanted = true;
    let v = 0;
    fadeTimer = setInterval(() => {
      v = Math.min(0.85, v + 0.06);
      audio.volume = v;
      if (v >= 0.85) clearInterval(fadeTimer);
    }, 90);
  }
  function pauseMusic(byUser) {
    clearInterval(fadeTimer);
    audio.pause();
    if (byUser) state.musicWanted = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!audio.paused) { state.resumeAfterHide = true; audio.pause(); }
    } else if (state.resumeAfterHide) {
      state.resumeAfterHide = false;
      audio.play().catch(() => {});
    }
  });

  /* ------------------------------------------------------- buka undangan */
  const desktopMQ = window.matchMedia('(min-width: 1024px)');

  function openInvitation() {
    if (state.opened) return;
    state.opened = true;
    body.classList.add('is-open');
    body.classList.remove('is-locked');
    if (pageEl) pageEl.inert = false;
    window.scrollTo(0, 0);
    playMusic();
    coverEl.classList.add('is-open');
    if (!desktopMQ.matches) {
      setTimeout(() => {
        if (state.opened && !desktopMQ.matches) {
          coverEl.classList.add('is-gone');
          const v = coverEl.querySelector('video');
          if (v) v.pause();
        }
      }, 1250);
    }
  }
  desktopMQ.addEventListener('change', () => {
    if (!state.opened || !coverEl) return;
    const v = coverEl.querySelector('video');
    if (desktopMQ.matches) { coverEl.classList.remove('is-gone'); if (v) v.play().catch(() => {}); }
    else { coverEl.classList.add('is-gone'); if (v) v.pause(); }
  });

  /** Dipakai editor: tampilkan sampul atau isi tanpa animasi. */
  function forceView(view) {
    if (!coverEl) return;
    body.classList.add('no-anim');
    if (view === 'cover') {
      state.opened = false;
      coverEl.classList.remove('is-open', 'is-gone');
      body.classList.remove('is-open');
      body.classList.add('is-locked');
      window.scrollTo(0, 0);
      if (pageEl) pageEl.inert = true;
      const v = coverEl.querySelector('video');
      if (v) v.play().catch(() => {});
    } else {
      state.opened = true;
      coverEl.classList.add('is-open');
      if (!desktopMQ.matches) coverEl.classList.add('is-gone');
      body.classList.add('is-open');
      body.classList.remove('is-locked');
      if (pageEl) pageEl.inert = false;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('no-anim')));
  }

  /* ---------------------------------------------------------------- lightbox */
  let lb = null;
  let lbIndex = 0;
  let lbOpener = null;

  function ensureLightbox() {
    if (lb) return lb;
    const img = h('img', { alt: '' });
    const count = h('p', { class: 'lb-count', 'aria-live': 'polite' });
    const mk = (cls, label, ic, fn) => h('button', { class: 'lb-btn ' + cls, type: 'button', 'aria-label': label, onclick: fn }, icon(ic));
    lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Galeri foto' }, img, count, mk('lb-close', 'Tutup', 'x', closeLightbox), mk('lb-prev', 'Foto sebelumnya', 'left', () => stepLightbox(-1)), mk('lb-next', 'Foto berikutnya', 'right', () => stepLightbox(1)));
    lb.img = img;
    lb.count = count;
    let x0 = null;
    lb.addEventListener('pointerdown', (e) => (x0 = e.clientX));
    lb.addEventListener('pointerup', (e) => {
      if (x0 != null && Math.abs(e.clientX - x0) > 50) stepLightbox(e.clientX < x0 ? 1 : -1);
      x0 = null;
    });
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('show')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft') stepLightbox(-1);
    });
    document.body.append(lb);
    return lb;
  }
  function paintLightbox() {
    const g = state.data.gallery;
    lb.img.src = g[lbIndex];
    lb.img.alt = `Foto ${lbIndex + 1}`;
    lb.count.textContent = `${lbIndex + 1} / ${g.length}`;
    const nxt = new Image();
    nxt.src = g[(lbIndex + 1) % g.length];
  }
  function openLightbox(i) {
    ensureLightbox();
    lbOpener = document.activeElement;
    lbIndex = i;
    paintLightbox();
    lb.classList.add('show');
    lb.querySelector('.lb-close').focus();
    body.style.overflow = 'hidden';
  }
  function stepLightbox(n) {
    const len = state.data.gallery.length;
    lbIndex = (lbIndex + n + len) % len;
    paintLightbox();
  }
  function closeLightbox() {
    lb.classList.remove('show');
    body.style.overflow = '';
    if (lbOpener && lbOpener.focus) lbOpener.focus();
  }

  /* ----------------------------------------------------------------- ucapan */
  const SAMPLE_WISHES = {
    items: [
      { name: 'Contoh Tamu', attendance: 'hadir', message: 'Selamat berbahagia! Semoga menjadi keluarga yang sakinah, mawaddah, warahmah.', createdAt: new Date(Date.now() - 3600e3).toISOString() },
      { name: 'Teman Kantor', attendance: 'ragu', message: 'Semoga lancar sampai hari H ya!', createdAt: new Date(Date.now() - 86400e3).toISOString() },
    ],
    summary: { hadir: 1, ragu: 1, tidak: 0 },
  };
  const STATUS = { hadir: 'Hadir', tidak: 'Tidak hadir', ragu: 'Masih ragu' };

  function paintWishes(data, sample) {
    const list = document.getElementById('wish-list');
    const tally = document.getElementById('wish-tally');
    if (!list) return;
    const s = data.summary || {};
    const bits = [s.hadir && `${s.hadir} hadir`, s.ragu && `${s.ragu} masih ragu`, s.tidak && `${s.tidak} berhalangan`].filter(Boolean);
    tally.textContent = sample ? 'Contoh tampilan di pratinjau' : bits.length ? bits.join(', ') : 'Belum ada konfirmasi';
    if (!data.items.length) {
      list.replaceChildren(h('p', { class: 'wish-empty' }, 'Belum ada ucapan. Jadilah yang pertama.'));
      return;
    }
    list.replaceChildren(
      ...data.items.map((w) => h('article', { class: 'wish' }, h('div', { class: 'wish-head' }, h('span', { class: 'wish-name' }, w.name), h('span', { class: 'wish-status' }, STATUS[w.attendance] || ''), h('time', { class: 'wish-time', datetime: w.createdAt }, timeAgo(w.createdAt))), w.message && h('p', null, w.message)))
    );
  }

  async function loadWishes() {
    if (!document.getElementById('wish-list')) return;
    if (EMBED) return paintWishes(SAMPLE_WISHES, true);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(SLUG)}/wishes`);
      if (res.status === 404 && PREVIEW) return paintWishes(SAMPLE_WISHES, true);
      if (!res.ok) throw 0;
      paintWishes(await res.json(), false);
    } catch (_) {
      const t = document.getElementById('wish-tally');
      if (t) t.textContent = 'Ucapan belum dapat dimuat';
    }
  }
  setInterval(() => { if (!document.hidden && !EMBED) loadWishes(); }, 45000);

  /* ------------------------------------------------------------- orkestrasi */
  function update(d) {
    state.data = d;
    document.title = `${d.event.title} — Undangan`;
    applyTheme(d);
    renderCover(d);
    renderSections(d);
    setupMusic(d);
    setTimeout(hideBoot, 3000); // jaring pengaman jika poster/video lambat
  }

  function showError(msg, title) {
    app.replaceChildren(h('main', { class: 'notfound' }, h('h1', null, title || 'Undangan tidak ditemukan'), h('p', null, msg)));
    body.classList.remove('is-locked');
    hideBoot();
  }

  async function init() {
    if (EMBED) {
      window.addEventListener('message', (ev) => {
        if (ev.origin !== location.origin) return;
        const m = ev.data || {};
        if (m.type === 'set-data' && m.data) update(m.data);
        if (m.type === 'view') forceView(m.view);
      });
      parent.postMessage({ type: 'invitation-ready' }, location.origin);
      return;
    }
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(SLUG)}${PREVIEW ? '?preview=1' : ''}`, { cache: 'no-store' });
      if (res.status === 404) return showError('Periksa kembali link undangan Anda, atau undangan ini belum dipublikasikan.');
      if (!res.ok) throw 0;
      update(await res.json());
    } catch (_) {
      showError('Silakan muat ulang halaman ini.', 'Undangan belum dapat dimuat');
    }
  }
  init();
})();
