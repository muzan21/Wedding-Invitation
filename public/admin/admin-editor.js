/* Dashboard — editor undangan: form, unggah media, preview langsung, simpan & publikasi */
(function () {
  'use strict';
  const A = window.Admin;
  const { h, icon, toast, api, upload, prepImage, posterFromVideo, copyText, confirmDialog, dialog, fmtStamp, slugify, topbar, statusPill, root } = A;

  const LIMIT_MB = { video: 120, audio: 30, image: 15 };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  };
  /** replaceChildren tidak meratakan array dan mencetak false/undefined sebagai teks; helper ini yang menanganinya. */
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const move = (arr, i, d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  let S = null; // state editor
  let cleanups = [];
  let uid = 0;

  const TABS = [
    ['dasar', 'Dasar'], ['acara', 'Acara'], ['mempelai', 'Mempelai'], ['media', 'Video & Musik'],
    ['galeri', 'Galeri'], ['teks', 'Teks'], ['tema', 'Tema'], ['tamu', 'Tamu & RSVP'], ['bagikan', 'Bagikan'],
  ];

  const PRESETS = [
    ['Bunga (bawaan)', { primary: '#3f7a4d', accent: '#b94d76', background: '#fffafb', text: '#463f44' }],
    ['Lavender', { primary: '#5b4a8a', accent: '#8d62b5', background: '#fbf9fe', text: '#3f3a4a' }],
    ['Sage', { primary: '#3d5a46', accent: '#4f7a5a', background: '#f8faf6', text: '#39433c' }],
    ['Biru malam', { primary: '#1f3550', accent: '#9a7b2f', background: '#fbfaf6', text: '#2f3540' }],
  ];
  const FONT_OPTS = [
    ['modern', 'Modern', "'Instrument Serif', Georgia, serif", 'Sandy & Kala'],
    ['klasik', 'Klasik', "'Cormorant Garamond', Georgia, serif", 'Sandy & Kala'],
    ['romantis', 'Romantis', "'Playfair Display', Georgia, serif", 'Sandy & Kala'],
  ];

  /* ------------------------------------------------------------- state util */
  const snapshot = () => JSON.stringify({ slug: S.slug, draft: S.draft });
  const isDirty = () => S && snapshot() !== S.saved;

  function onChange() {
    paintBar();
    schedulePreview();
  }

  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(pushPreview, 220);
  }
  function pushPreview() {
    if (!S || !S.ready || !S.iframe.contentWindow) return;
    S.iframe.contentWindow.postMessage({ type: 'set-data', data: { slug: S.slug, preview: true, ...clone(S.draft) } }, location.origin);
  }
  function pushView() {
    if (S && S.ready) S.iframe.contentWindow.postMessage({ type: 'view', view: S.view }, location.origin);
  }

  /* ----------------------------------------------------------------- fields */
  function field(label, path, o = {}) {
    const id = 'f' + ++uid;
    const type = o.type || 'text';
    let ctl;
    if (type === 'textarea') ctl = h('textarea', { class: 'input', id, rows: o.rows || 3, maxlength: o.max, placeholder: o.placeholder });
    else if (type === 'select') ctl = h('select', { class: 'input', id }, o.options.map(([v, t]) => h('option', { value: v }, t)));
    else ctl = h('input', { class: 'input', id, type, maxlength: o.max, placeholder: o.placeholder, min: o.min, max: o.maxv, list: o.list });
    ctl.value = get(S.draft, path) ?? '';
    ctl.addEventListener('input', () => {
      set(S.draft, path, type === 'number' ? (ctl.value === '' ? '' : +ctl.value) : ctl.value);
      if (o.onInput) o.onInput(ctl.value);
      onChange();
    });
    return h('div', { class: 'field', style: o.style }, h('label', { for: id }, label), ctl, o.hint && h('span', { class: 'hint' }, o.hint));
  }

  function toggle(label, path, hint) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!get(S.draft, path);
    cb.addEventListener('change', () => { set(S.draft, path, cb.checked); onChange(); });
    return h('label', { class: 'switch' }, cb, h('span', null, label, hint && h('span', { class: 'hint' }, ' ' + hint)));
  }

  function colorField(label, path) {
    const id = 'f' + ++uid;
    const code = h('code', null, get(S.draft, path));
    const c = h('input', { class: 'input', id, type: 'color', value: get(S.draft, path) });
    c.addEventListener('input', () => { set(S.draft, path, c.value); code.textContent = c.value; onChange(); });
    return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'color-row' }, c, code));
  }

  function group(title, ...kids) {
    return h('section', { class: 'group' }, title && h('h3', null, title), kids);
  }

  /* ---------------------------------------------------------- media upload */
  function mediaField({ label, path, kind, accept, hint, onSet, emptyText }) {
    const wrap = h('div', { class: 'field' });
    const input = h('input', { type: 'file', accept, hidden: true });
    let busy = null;
    let error = '';

    const draw = () => {
      const url = get(S.draft, path);
      const name = url ? decodeURIComponent(url.split('/').pop()) : emptyText || 'Belum ada file';
      let pv;
      if (kind === 'image') pv = h('div', { class: 'pv', style: url ? { backgroundImage: `url("${url}")` } : {} }, url ? '' : 'Foto');
      else if (kind === 'video') pv = h('div', { class: 'pv' }, url ? h('video', { src: url + '#t=0.5', muted: true, preload: 'metadata', playsinline: true }) : 'Video');
      else pv = h('div', { class: 'pv' }, '♪');
      const pick = h('button', { class: 'btn small', type: 'button', disabled: !!busy, onclick: () => input.click() }, url ? 'Ganti' : 'Unggah');
      const del = url && h('button', { class: 'btn small danger', type: 'button', disabled: !!busy, onclick: () => { set(S.draft, path, ''); draw(); onChange(); } }, 'Hapus');
      const bar = busy ? h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(busy.p * 100)}%` } })) : null;
      fill(wrap,
        h('span', { class: 'lbl' }, label),
        h('div', { class: 'upload' },
          h('div', { class: 'upload-box' }, pv, h('div', { class: 'info' }, h('strong', null, busy ? busy.text : name), bar, h('div', { class: 'btns' }, pick, del))),
          kind === 'audio' && url && h('audio', { controls: true, preload: 'none', src: url }),
          error && h('p', { class: 'err-text', role: 'alert' }, error)),
        hint && h('span', { class: 'hint' }, hint),
        input);
    };

    input.addEventListener('change', async () => {
      const f = input.files[0];
      input.value = '';
      if (!f) return;
      error = '';
      if (f.size > LIMIT_MB[kind] * 1024 * 1024 && !(kind === 'image' && /^image\/(jpeg|png|webp)$/.test(f.type))) {
        error = `File terlalu besar (maks ${LIMIT_MB[kind]} MB). Kompres dulu lalu coba lagi.`;
        return draw();
      }
      try {
        busy = { p: 0, text: 'Menyiapkan…' };
        draw();
        const file = kind === 'image' ? await prepImage(f) : f;
        busy = { p: 0, text: `Mengunggah ${f.name}` };
        draw();
        const r = await upload(file, kind, (p) => { busy.p = p; const i = wrap.querySelector('.bar i'); if (i) i.style.width = `${Math.round(p * 100)}%`; });
        set(S.draft, path, r.url);
        busy = null;
        draw();
        onChange();
        if (onSet) await onSet(r.url);
      } catch (e) {
        busy = null;
        error = e.message;
        draw();
      }
    });
    draw();
    return wrap;
  }

  /* ------------------------------------------------------------------- tabs */
  const rerender = () => renderTab(true);

  function tabDasar() {
    const slugIn = h('input', { class: 'input', id: 'slug', maxlength: 60, value: S.slug, autocomplete: 'off', spellcheck: 'false' });
    slugIn.addEventListener('input', () => { S.slug = slugIn.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'); onChange(); });
    slugIn.addEventListener('blur', () => { S.slug = slugify(slugIn.value) || S.slug; slugIn.value = S.slug; onChange(); });
    return [
      group('Identitas acara',
        field('Nama acara atau mempelai', 'event.title', { max: 120, hint: 'Tampil di sampul, judul halaman, dan pratinjau WhatsApp.' }),
        h('datalist', { id: 'types' }, ['Pernikahan', 'Ulang tahun', 'Khitanan', 'Tasyakuran', 'Reuni', 'Peresmian'].map((t) => h('option', { value: t }))),
        field('Jenis acara', 'event.type', { max: 60, list: 'types' }),
        field('Teks kecil di atas nama', 'event.subtitle', { max: 120, placeholder: 'The Wedding of' })),
      group('Link undangan',
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'slug' }, 'Alamat link'),
          h('div', { class: 'prefix' }, h('span', null, `${location.host}/undangan/`), slugIn),
          h('span', { class: 'hint' }, 'Huruf kecil, angka, dan tanda hubung. Jika undangan sudah terbit, mengganti link membuat link lama tidak bisa dibuka.'))),
      group('Bagian yang ditampilkan',
        toggle('Mempelai', 'sections.people'), toggle('Cerita', 'sections.story'), toggle('Hitung mundur', 'sections.countdown'),
        toggle('Galeri foto', 'sections.gallery'), toggle('Informasi tambahan', 'sections.extra'), toggle('RSVP dan ucapan', 'sections.rsvp')),
      group('RSVP',
        toggle('Tampilkan ucapan tamu di halaman undangan', 'rsvp.showWishes'),
        field('Maksimal jumlah tamu per konfirmasi', 'rsvp.maxGuests', { type: 'number', min: 1, maxv: 500 })),
    ];
  }

  function autoDay() {
    const d = S.draft.event.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'otomatis';
    const [y, m, dd] = d.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
  }

  function tabAcara() {
    const dayField = field('Hari', 'event.day', { max: 20, placeholder: autoDay(), hint: 'Kosongkan agar terisi otomatis dari tanggal.' });
    const dayInput = dayField.querySelector('input');
    const dateField = field('Tanggal', 'event.date', { type: 'date', onInput: () => (dayInput.placeholder = autoDay()) });
    const sched = S.draft.event.schedule;
    return [
      group('Waktu',
        h('div', { class: 'row' }, dateField, dayField),
        h('div', { class: 'row three' },
          field('Mulai', 'event.time', { type: 'time' }),
          field('Selesai', 'event.endTime', { type: 'time', hint: 'Boleh kosong' }),
          field('Zona', 'event.tz', { type: 'select', options: [['WIB', 'WIB'], ['WITA', 'WITA'], ['WIT', 'WIT']] }))),
      group('Lokasi',
        field('Nama lokasi', 'event.venue', { max: 160 }),
        field('Alamat', 'event.address', { type: 'textarea', rows: 2, max: 400 }),
        field('Link Google Maps', 'event.mapsUrl', { type: 'url', placeholder: 'https://maps.app.goo.gl/…', hint: 'Buka Google Maps, cari lokasi, tekan Bagikan, lalu Salin link. Tombol "Lihat Lokasi" akan membuka link ini.' })),
      group(null,
        h('div', { class: 'sub' }, h('h3', null, 'Rangkaian acara'),
          h('button', { class: 'btn small', onclick: () => { if (sched.length < 10) { sched.push({ label: '', time: '' }); onChange(); rerender(); } } }, icon('plus'), 'Tambah')),
        sched.length === 0 && h('p', { class: 'hint' }, 'Contoh: Akad Nikah 10.00, Resepsi 11.30. Boleh dikosongkan.'),
        sched.map((s, i) => {
          const a = h('input', { class: 'input', value: s.label, placeholder: 'Akad Nikah', 'aria-label': 'Nama sesi', maxlength: 80 });
          const b = h('input', { class: 'input', value: s.time, placeholder: '10.00', 'aria-label': 'Jam', maxlength: 40 });
          a.oninput = () => { s.label = a.value; onChange(); };
          b.oninput = () => { s.time = b.value; onChange(); };
          return h('div', { class: 'mini' }, a, b, h('button', { class: 'icon-btn', 'aria-label': 'Hapus sesi', onclick: () => { sched.splice(i, 1); onChange(); rerender(); } }, icon('x')));
        })),
    ];
  }

  function tabMempelai() {
    const people = S.draft.people;
    return [
      h('div', { class: 'sub' }, h('h3', null, 'Orang yang ditampilkan'),
        people.length < 4 && h('button', { class: 'btn small', onclick: () => { people.push({ role: '', name: '', parents: '', photo: '', bio: '' }); onChange(); rerender(); } }, icon('plus'), 'Tambah')),
      people.length === 0 && h('p', { class: 'hint', style: { marginBottom: '1rem' } }, 'Kosong: bagian ini tidak tampil. Cocok untuk acara yang tidak membutuhkan profil.'),
      people.map((p, i) =>
        h('div', { class: 'item' },
          h('div', { class: 'item-head' }, `Orang ${i + 1}`,
            h('div', { class: 'item-tools' },
              h('button', { class: 'icon-btn', 'aria-label': 'Naikkan', disabled: i === 0, onclick: () => { move(people, i, -1); onChange(); rerender(); } }, icon('up')),
              h('button', { class: 'icon-btn', 'aria-label': 'Turunkan', disabled: i === people.length - 1, onclick: () => { move(people, i, 1); onChange(); rerender(); } }, icon('down')),
              h('button', { class: 'icon-btn', 'aria-label': 'Hapus', onclick: () => { people.splice(i, 1); onChange(); rerender(); } }, icon('x')))),
          h('div', { class: 'row' }, field('Peran', `people.${i}.role`, { max: 60, placeholder: 'Mempelai Pria' }), field('Nama lengkap', `people.${i}.name`, { max: 120 })),
          field('Orang tua', `people.${i}.parents`, { max: 240, placeholder: 'Putra dari Bapak … & Ibu …' }),
          mediaField({ label: 'Foto', path: `people.${i}.photo`, kind: 'image', accept: 'image/jpeg,image/png,image/webp', hint: 'Foto tampil dalam bingkai oval. Pilih foto portrait.' }),
          field('Profil singkat', `people.${i}.bio`, { type: 'textarea', rows: 3, max: 800, style: { marginBottom: 0 } }))),
      group('Cerita', field('Cerita atau profil acara', 'story', { type: 'textarea', rows: 7, max: 4000, hint: 'Pisahkan paragraf dengan satu baris kosong.' })),
    ];
  }

  function tabMedia() {
    return [
      group('Video sampul',
        mediaField({
          label: 'Video', path: 'media.video', kind: 'video', accept: 'video/mp4,video/webm,video/quicktime',
          hint: 'MP4 (H.264) paling aman di semua HP. Maks 120 MB; video portrait 9:16 paling cocok. Video diputar tanpa suara.',
          onSet: async (url) => {
            toast('Membuat poster dari video…');
            const f = await posterFromVideo(url);
            if (f) {
              try { const r = await upload(f, 'image'); S.draft.media.poster = r.url; onChange(); rerender(); toast('Poster dibuat otomatis'); } catch (_) {}
            }
          },
        }),
        mediaField({ label: 'Poster (tampil saat video dimuat)', path: 'media.poster', kind: 'image', accept: 'image/jpeg,image/png,image/webp', hint: 'Dibuat otomatis saat Anda mengunggah video. Boleh diganti.' })),
      group('Teks di atas video',
        field('Gaya sampul', 'cover.mode', {
          type: 'select',
          options: [['brief', 'Ringkas: tamu, tanggal, tombol'], ['full', 'Lengkap: nama, tanggal, tamu, tombol'], ['button', 'Hanya tombol']],
          hint: 'Jika video Anda sudah memuat nama pasangan, pilih Ringkas atau Hanya tombol agar tidak dobel.',
        }),
        field('Warna latar teks', 'cover.tone', { type: 'select', options: [['light', 'Terang (teks gelap)'], ['dark', 'Gelap (teks putih)']], hint: 'Pilih agar teks mudah dibaca di atas video Anda.' }),
        colorField('Warna latar sampul', 'cover.bg'),
        h('p', { class: 'hint', style: { marginTop: '-0.5rem', marginBottom: '0.9rem' } }, 'Terlihat di sisi video pada layar lebar. Samakan dengan warna latar video.'),
        field('Tulisan tombol', 'cover.buttonLabel', { max: 40, style: { marginBottom: 0 } })),
      group('Musik',
        mediaField({ label: 'Musik latar', path: 'media.music', kind: 'audio', accept: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/aac,.mp3,.m4a,.ogg,.wav,.aac', hint: 'MP3 atau M4A, maks 30 MB. Musik mulai setelah tamu menekan "Buka Undangan" dan berulang otomatis.', emptyText: 'Tanpa musik' }),
        field('Judul musik', 'media.musicTitle', { max: 100, style: { marginBottom: 0 } })),
    ];
  }

  function tabGaleri() {
    const g = S.draft.gallery;
    const addInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true });
    const replaceInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
    const status = h('p', { class: 'hint', role: 'status' });
    let replaceIdx = -1;

    async function uploadOne(f) {
      const file = await prepImage(f);
      return (await upload(file, 'image')).url;
    }
    addInput.addEventListener('change', async () => {
      const files = [...addInput.files].slice(0, 40 - g.length);
      addInput.value = '';
      let n = 0;
      for (const f of files) {
        status.textContent = `Mengunggah foto ${++n} dari ${files.length}…`;
        try { g.push(await uploadOne(f)); onChange(); } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
      }
      rerender();
    });
    replaceInput.addEventListener('change', async () => {
      const f = replaceInput.files[0];
      replaceInput.value = '';
      if (!f || replaceIdx < 0) return;
      status.textContent = 'Mengganti foto…';
      try { g[replaceIdx] = await uploadOne(f); onChange(); } catch (e) { toast(e.message, 'err'); }
      rerender();
    });

    return [
      h('div', { class: 'sub' }, h('h3', null, `Foto galeri (${g.length}/40)`)),
      h('p', { class: 'hint', style: { marginBottom: '0.8rem' } }, 'Foto otomatis diperkecil agar cepat dibuka. Foto pertama tampil lebih besar.'),
      h('div', { class: 'gal' },
        g.map((url, i) =>
          h('div', { class: 'gal-item' }, h('img', { src: url, alt: `Foto ${i + 1}`, loading: 'lazy' }),
            h('div', { class: 'tools' },
              h('button', { class: 'icon-btn', 'aria-label': 'Geser ke kiri', disabled: i === 0, onclick: () => { move(g, i, -1); onChange(); rerender(); } }, icon('left')),
              h('button', { class: 'icon-btn', 'aria-label': 'Ganti foto', onclick: () => { replaceIdx = i; replaceInput.click(); } }, icon('swap')),
              h('button', { class: 'icon-btn', 'aria-label': 'Geser ke kanan', disabled: i === g.length - 1, onclick: () => { move(g, i, 1); onChange(); rerender(); } }, icon('right')),
              h('button', { class: 'icon-btn', 'aria-label': 'Hapus foto', onclick: () => { g.splice(i, 1); onChange(); rerender(); } }, icon('x'))))),
        g.length < 40 && h('button', { class: 'gal-add', type: 'button', onclick: () => addInput.click() }, '+ Tambah foto')),
      status, addInput, replaceInput,
    ];
  }

  function tabTeks() {
    const ex = S.draft.extra;
    const hd = S.draft.headings;
    return [
      
group('Sambutan dan penutup',
  field('Sapaan di sampul (sebelum nama tamu)', 'texts.guestLabel', { max: 60 }),

  field('Kalimat pembuka', 'texts.opening', {
    type: 'textarea', rows: 5, max: 2000,
    hint: 'Maksimal 2.000 karakter.'
  }),

  field('Teks sambutan', 'texts.welcome', {
    type: 'textarea', rows: 8, max: 5000,
    hint: 'Maksimal 5.000 karakter.'
  }),

  field('Teks penutup', 'texts.closing', {
    type: 'textarea', rows: 8, max: 5000,
    hint: 'Maksimal 5.000 karakter.'
  }),

  field('Pengantar form RSVP', 'texts.rsvpIntro', {
    type: 'textarea', rows: 5, max: 2000,
    hint: 'Maksimal 2.000 karakter.',
    style: { marginBottom: 0 }
  })
),

      group('Judul setiap bagian',
        h('div', { class: 'row' }, Object.keys(hd).map((k) => field({ people: 'Mempelai', story: 'Cerita', event: 'Acara', gallery: 'Galeri', extra: 'Info tambahan', rsvp: 'RSVP' }[k], `headings.${k}`, { max: 60 })))),
      group(null,
        h('div', { class: 'sub' }, h('h3', null, 'Informasi tambahan'),
          h('button', { class: 'btn small', onclick: () => { if (ex.length < 12) { ex.push({ title: '', text: '' }); onChange(); rerender(); } } }, icon('plus'), 'Tambah')),
        ex.length === 0 && h('p', { class: 'hint' }, 'Contoh: dress code, hadiah, parkir, protokol kesehatan.'),
        ex.map((x, i) =>
          h('div', { class: 'item' },
            h('div', { class: 'item-head' }, `Catatan ${i + 1}`,
              h('div', { class: 'item-tools' },
                h('button', { class: 'icon-btn', 'aria-label': 'Naikkan', disabled: i === 0, onclick: () => { move(ex, i, -1); onChange(); rerender(); } }, icon('up')),
                h('button', { class: 'icon-btn', 'aria-label': 'Turunkan', disabled: i === ex.length - 1, onclick: () => { move(ex, i, 1); onChange(); rerender(); } }, icon('down')),
                h('button', { class: 'icon-btn', 'aria-label': 'Hapus', onclick: () => { ex.splice(i, 1); onChange(); rerender(); } }, icon('x')))),
            field('Judul', `extra.${i}.title`, { max: 80 }),
            field('Isi', `extra.${i}.text`, { type: 'textarea', rows: 2, max: 600, style: { marginBottom: 0 } })))),
    ];
  }

  function tabTema() {
    const th = S.draft.theme;
    return [
      group('Palet warna',
        h('div', { class: 'swatches', style: { marginBottom: '1rem' } },
          PRESETS.map(([name, c]) =>
            h('button', { class: 'preset', type: 'button', onclick: () => { Object.assign(th, c); onChange(); rerender(); } },
              h('span', { class: 'dots' }, [c.primary, c.accent, c.background].map((x) => h('i', { style: { background: x } }))), name))),
        h('div', { class: 'row' }, colorField('Warna judul', 'theme.primary'), colorField('Warna aksen (tombol)', 'theme.accent')),
        h('div', { class: 'row' }, colorField('Warna latar halaman', 'theme.background'), colorField('Warna teks', 'theme.text')),
        h('p', { class: 'hint' }, 'Warna teks pada tombol dipilih otomatis (putih atau gelap) agar tetap terbaca.')),
      group('Gaya huruf',
        h('div', { style: { display: 'grid', gap: '0.5rem' } },
          FONT_OPTS.map(([v, name, fam, sample]) => {
            const r = h('input', { type: 'radio', name: 'font', value: v });
            r.checked = th.font === v;
            r.addEventListener('change', () => { th.font = v; onChange(); });
            return h('label', { class: 'font-opt' }, r, h('b', { style: { fontFamily: fam } }, sample), h('span', { class: 'hint' }, name));
          }))),
    ];
  }

  function tabTamu() {
    const box = h('div', null, h('p', { class: 'hint' }, 'Memuat…'));
    const load = () =>
      api(`/invitations/${S.id}/rsvps`).then(({ items, summary }) => {
        const label = { hadir: 'Hadir', tidak: 'Tidak hadir', ragu: 'Masih ragu' };
        fill(box,
          S.rec.status !== 'published' && h('div', { class: 'banner' }, 'Undangan belum dipublikasikan, jadi tamu belum bisa mengisi RSVP.'),
          h('div', { class: 'tiles' }, [[summary.guests, 'Orang hadir'], [summary.tidak, 'Tidak hadir'], [summary.ragu, 'Masih ragu'], [summary.wishes, 'Ucapan']].map(([n, t]) => h('div', { class: 'tile' }, h('b', null, n), h('span', null, t)))),
          h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' } },
            h('a', { class: 'btn small', href: `/api/admin/invitations/${S.id}/rsvps.csv`, download: '' }, 'Unduh CSV'),
            h('button', { class: 'btn small', onclick: load }, 'Muat ulang')),
          items.length === 0
            ? h('div', { class: 'empty' }, 'Belum ada konfirmasi atau ucapan.')
            : h('div', { class: 'table-wrap' }, h('table', null,
                h('thead', null, h('tr', null, ['Nama', 'Status', 'Tamu', 'Ucapan', 'Waktu', ''].map((t) => h('th', null, t)))),
                h('tbody', null, items.map((r) =>
                  h('tr', null, h('td', null, r.name), h('td', null, label[r.attendance]), h('td', null, r.attendance === 'hadir' ? r.guests : '-'), h('td', { class: 'msg' }, r.message || '-'), h('td', null, fmtStamp(r.createdAt)),
                    h('td', null, h('button', { class: 'icon-btn', 'aria-label': `Hapus ${r.name}`, onclick: async () => {
                      if (!(await confirmDialog('Hapus data ini?', `Konfirmasi dan ucapan dari ${r.name} akan dihapus.`, 'Hapus', true))) return;
                      try { await api(`/invitations/${S.id}/rsvps/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { toast(e.message, 'err'); }
                    } }, icon('x')))))))));
      }).catch((e) => box.replaceChildren(h('p', { class: 'err-text' }, e.message)));
    load();
    return box;
  }

  function tabBagikan() {
    const base = `${location.origin}/undangan/${S.rec.slug}`;
    const names = h('textarea', { class: 'input', rows: 5, placeholder: 'Budi Santoso\nKeluarga Bapak Andi\nRina' });
    const msg = h('textarea', { class: 'input', rows: 6 });
    msg.value = 'Kepada Yth. {nama},\n\nDengan hormat, kami mengundang Anda ke {acara}.\nSilakan buka undangan di:\n{link}\n\nTerima kasih.';
    const out = h('div');
    const make = () => {
      const list = names.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 300);
      const rows = list.map((n) => {
        const link = `${base}?to=${encodeURIComponent(n)}`;
        const text = msg.value.replaceAll('{nama}', n).replaceAll('{acara}', S.draft.event.title).replaceAll('{link}', link);
        return { n, link, text };
      });
      fill(out,
        rows.length > 1 && h('button', { class: 'btn small', style: { margin: '0.6rem 0' }, onclick: () => copyText(rows.map((r) => `${r.n}: ${r.link}`).join('\n'), 'Semua link disalin') }, 'Salin semua link'),
        rows.map((r) => h('div', { class: 'guestlink' },
          h('div', { style: { minWidth: 0 } }, h('strong', null, r.n), h('code', null, r.link)),
          h('div', { class: 'btns' },
            h('button', { class: 'btn small', onclick: () => copyText(r.link, 'Link disalin') }, 'Salin'),
            h('a', { class: 'btn small', target: '_blank', rel: 'noopener', href: `https://wa.me/?text=${encodeURIComponent(r.text)}` }, 'WhatsApp')))));
    };
    return [
      S.rec.status !== 'published' && h('div', { class: 'banner' }, 'Link ini baru bisa dibuka tamu setelah undangan dipublikasikan.'),
      group('Link utama',
        h('div', { class: 'guestlink', style: { borderBottom: 0 } }, h('code', { style: { fontSize: '0.9rem', color: 'var(--text)' } }, base),
          h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => copyText(base, 'Link disalin') }, 'Salin'),
            S.rec.status === 'published' && h('a', { class: 'btn small', href: base, target: '_blank', rel: 'noopener' }, 'Buka')))),
      group('Link per tamu',
        h('p', { class: 'hint', style: { marginBottom: '0.7rem' } }, 'Satu undangan, banyak tamu. Nama tamu tampil di sampul dan otomatis terisi di form RSVP. Tulis satu nama per baris.'),
        h('div', { class: 'field' }, h('label', null, 'Nama tamu'), names),
        h('div', { class: 'field' }, h('label', null, 'Pesan WhatsApp'), msg, h('span', { class: 'hint' }, 'Gunakan {nama}, {acara}, dan {link}.')),
        h('button', { class: 'btn primary', onclick: make }, 'Buat link tamu'), out),
    ];
  }

  const TAB_FN = { dasar: tabDasar, acara: tabAcara, mempelai: tabMempelai, media: tabMedia, galeri: tabGaleri, teks: tabTeks, tema: tabTema, tamu: tabTamu, bagikan: tabBagikan };

  
function renderTab(keepScroll) {
  const top = S.body.scrollTop;

  S.tabEls.forEach(([id, el]) =>
    el.setAttribute('aria-selected', String(id === S.tab))
  );

  S.body.replaceChildren(
    ...TAB_FN[S.tab]().flat(Infinity).filter(Boolean)
  );

  S.body.scrollTop = keepScroll ? top : 0;
}


  /* ------------------------------------------------------- simpan & publikasi */
  function applyRec(r) {
    S.rec = r;
    S.slug = r.slug;
    S.draft = clone(r.draft);
    S.saved = snapshot();
    paintBar();
  }

  async function save() {
    if (S.rec.status === 'published' && S.slug !== S.rec.slug) {
      if (!(await confirmDialog('Ganti link undangan?', `Link lama /undangan/${S.rec.slug} tidak akan bisa dibuka lagi. Tamu yang sudah menerima link lama harus dikirimi link baru.`, 'Ganti link'))) return false;
    }
    try {
      const r = await api(`/invitations/${S.id}`, { method: 'PUT', body: { slug: S.slug, draft: S.draft } });
      applyRec(r);
      renderTab(true);
      toast('Draf disimpan');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    }
  }

  async function publish() {
    if (isDirty() && !(await save())) return;
    try {
      const r = await api(`/invitations/${S.id}/publish`, { method: 'POST', body: { published: true } });
      S.rec = r;
      paintBar();
      const url = `${location.origin}/undangan/${r.slug}`;
      await dialog((close) =>
        h('div', { class: 'dlg' }, h('h2', null, 'Undangan sudah terbit'), h('p', { class: 'hint', style: { fontSize: '0.95rem' } }, 'Tamu bisa membuka undangan lewat link ini:'),
          h('code', { style: { background: '#f5f0f2', padding: '0.5rem 0.7rem', borderRadius: '8px', overflowWrap: 'anywhere' } }, url),
          h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { copyText(url, 'Link disalin'); } }, 'Salin link'), h('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener', onclick: () => close(true) }, 'Buka undangan'))));
    } catch (e) { toast(e.message, 'err'); }
  }

  async function unpublish() {
    if (!(await confirmDialog('Tarik dari publikasi?', 'Link undangan tidak bisa dibuka tamu sampai Anda mempublikasikannya lagi. Data tidak dihapus.', 'Tarik'))) return;
    try { S.rec = await api(`/invitations/${S.id}/publish`, { method: 'POST', body: { published: false } }); paintBar(); renderTab(true); toast('Undangan ditarik dari publikasi'); } catch (e) { toast(e.message, 'err'); }
  }

  async function openPreviewTab() {
    if (isDirty() && !(await save())) return;
    window.open(`/undangan/${S.rec.slug}?preview=1&to=${encodeURIComponent('Nama Tamu')}`, '_blank', 'noopener');
  }

  function paintBar() {
    if (!S || !S.bar) return;
    const dirty = isDirty();
    const published = S.rec.status === 'published';
    const pending = published && (dirty || S.rec.hasUnpublished);
    S.bar.title.textContent = S.draft.event.title || 'Tanpa judul';
    S.bar.status.replaceChildren(statusPill({ status: S.rec.status, hasUnpublished: S.rec.hasUnpublished || (published && dirty) }));
    S.bar.dirty.textContent = dirty ? 'Belum disimpan' : '';
    S.bar.save.disabled = !dirty;
    S.bar.publish.textContent = !published ? 'Publikasikan' : pending ? 'Terbitkan perubahan' : 'Sudah terbit';
    S.bar.publish.disabled = published && !pending;
    S.bar.unpub.hidden = !published;
  }

  /* ---------------------------------------------------------------- tampilan */
  const DEV = { hp: { w: 390, h: 800, t: 'HP' }, tab: { w: 768, h: 1024, t: 'Tablet' }, desk: { w: 1280, h: 800, t: 'Desktop' } };

  function layoutFrame() {
    if (!S || !S.stageView.isConnected) return;
    const d = DEV[S.device];
    const pw = S.stageView.clientWidth - 32;
    const ph = S.stageView.clientHeight - 32;
    if (pw <= 0 || ph <= 0) return;
    const s = Math.min(1, pw / d.w, ph / d.h);
    S.box.style.width = `${d.w * s}px`;
    S.box.style.height = `${d.h * s}px`;
    S.box.style.borderRadius = S.device === 'hp' ? '22px' : '10px';
    S.iframe.style.width = `${d.w}px`;
    S.iframe.style.height = `${d.h}px`;
    S.iframe.style.transform = `scale(${s})`;
  }

  async function renderEditor(id) {
    cleanup();
    root.replaceChildren(topbar(), h('div', { class: 'wrap' }, h('p', { class: 'hint' }, 'Memuat…')));
    let rec;
    try { rec = await api(`/invitations/${id}`); } catch (e) { toast(e.message, 'err'); location.hash = '#/'; return; }

    S = { id, rec, slug: rec.slug, draft: clone(rec.draft), tab: 'dasar', device: 'hp', view: 'cover', ready: false, pane: 'form' };
    S.saved = snapshot();

    /* top bar */
    const bar = {
      title: h('span', { class: 'title' }),
      status: h('span'),
      dirty: h('span', { class: 'hint hide-sm' }),
      save: h('button', { class: 'btn small', onclick: save }, 'Simpan draf'),
      publish: h('button', { class: 'btn small primary', onclick: publish }),
      unpub: h('button', { class: 'btn small hide-sm', onclick: unpublish }, 'Tarik publikasi'),
    };
    S.bar = bar;
    const top = h('header', { class: 'topbar' },
      h('a', { class: 'btn small', href: '#/', 'aria-label': 'Kembali ke daftar' }, icon('back'), h('span', { class: 'hide-sm' }, 'Daftar')),
      bar.title, bar.status, bar.dirty,
      h('span', { style: { marginRight: 'auto' } }),
      bar.unpub, bar.save, bar.publish);

    /* panel kiri */
    S.tabEls = TABS.map(([tid, label]) => [tid, h('button', { class: 'tab', role: 'tab', onclick: () => { S.tab = tid; renderTab(); } }, label)]);
    S.body = h('div', { class: 'tab-body' });
    const panel = h('div', { class: 'panel' }, h('div', { class: 'tabs', role: 'tablist' }, S.tabEls.map((x) => x[1])), S.body);

    /* panel kanan */
    S.iframe = h('iframe', { title: 'Pratinjau undangan', src: `/undangan/${encodeURIComponent(rec.slug)}?embed=1&preview=1&to=${encodeURIComponent('Nama Tamu')}` });
    S.box = h('div', { class: 'frame-box' }, S.iframe);
    S.stageView = h('div', { class: 'stage-view' }, S.box);
    const devBtns = Object.entries(DEV).map(([k, d]) => h('button', { 'aria-pressed': String(k === S.device), onclick: () => { S.device = k; devBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btnOf[k]))); layoutFrame(); } }, d.t));
    const btnOf = Object.fromEntries(Object.keys(DEV).map((k, i) => [k, devBtns[i]]));
    const viewBtns = [['cover', 'Sampul'], ['content', 'Isi undangan']].map(([k, t]) => h('button', { 'aria-pressed': String(k === S.view), onclick: () => { S.view = k; viewBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['cover', 'content'][i] === k))); pushView(); } }, t));
    const stage = h('div', { class: 'stage' },
      h('div', { class: 'stage-bar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Bagian' }, viewBtns), h('div', { class: 'seg', role: 'group', 'aria-label': 'Perangkat' }, devBtns),
        h('button', { class: 'btn small', onclick: openPreviewTab }, 'Buka pratinjau penuh')),
      S.stageView);

    const wrap = h('div', { class: 'editor-wrap', 'data-pane': 'form' }, panel, stage);
    const mobileSwitch = h('div', { class: 'mobile-switch' },
      ...['form', 'preview'].map((k) => h('button', { 'aria-pressed': String(k === 'form'), 'data-k': k, onclick: () => { wrap.dataset.pane = k; mobileSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k))); setTimeout(layoutFrame, 30); } }, k === 'form' ? 'Isi' : 'Pratinjau')));
    root.replaceChildren(top, wrap, mobileSwitch);

    /* sinkron dengan iframe */
    const onMsg = (ev) => {
      if (ev.origin !== location.origin || ev.source !== S.iframe.contentWindow) return;
      if (ev.data && ev.data.type === 'invitation-ready') { S.ready = true; pushPreview(); pushView(); }
    };
    window.addEventListener('message', onMsg);
    const ro = new ResizeObserver(layoutFrame);
    ro.observe(S.stageView);
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (isDirty()) save(); } };
    document.addEventListener('keydown', onKey);
    const onUnload = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    cleanups = [() => window.removeEventListener('message', onMsg), () => ro.disconnect(), () => document.removeEventListener('keydown', onKey), () => window.removeEventListener('beforeunload', onUnload), () => clearTimeout(previewTimer)];

    paintBar();
    renderTab();
    layoutFrame();
  }

  function cleanup() {
    cleanups.forEach((f) => f());
    cleanups = [];
    S = null;
  }

  A.beforeLeave = () => {
    if (!S) return true;
    if (!isDirty() || confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?')) { cleanup(); return true; }
    history.replaceState(null, '', `#/edit/${S.id}`); // kembalikan alamat tanpa memuat ulang editor
    return false;
  };
  A.renderEditor = renderEditor;
  A.route();
})();
