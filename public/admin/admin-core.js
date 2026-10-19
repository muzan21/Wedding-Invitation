/* Dashboard — inti: helper, API, login, daftar undangan. Editor ada di admin-editor.js */
(function () {
  'use strict';

  const root = document.getElementById('root');

  /* ---------------------------------------------------------------- helper */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const svg = (m) => { const t = document.createElement('template'); t.innerHTML = m.trim(); return t.content.firstChild; };
  const IC = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  };
  const icon = (n) => svg(IC[n]);

  function toast(msg, type) {
    const t = h('div', { class: 'toast' + (type === 'err' ? ' err' : '') }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), type === 'err' ? 6000 : 2800);
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg || 'Disalin');
  }

  function dialog(build) {
    return new Promise((resolve) => {
      const dlg = h('dialog');
      const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
      dlg.append(build(close));
      dlg.addEventListener('cancel', () => { dlg.remove(); resolve(null); });
      document.body.append(dlg);
      dlg.showModal();
    });
  }
  const confirmDialog = (title, text, okLabel = 'Ya', danger = false) =>
    dialog((close) =>
      h('div', { class: 'dlg' }, h('h2', null, title), h('p', { class: 'hint', style: { fontSize: '0.95rem' } }, text),
        h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Batal'), h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => close(true) }, okLabel)))
    ).then(Boolean);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  const fmtStamp = (iso) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  function slugify(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  }

  /* ------------------------------------------------------------------- API */
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api/admin' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_) {
      throw new Error('Tidak dapat terhubung ke server');
    }
    let json = null;
    try { json = await res.json(); } catch (_) {}
    if (res.status === 401 && path !== '/login') {
      renderLogin();
      throw new Error('Sesi berakhir, silakan masuk lagi');
    }
    if (!res.ok) throw new Error((json && json.error) || 'Terjadi kesalahan');
    return json;
  }

  function upload(file, kind, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name || 'file');
      const x = new XMLHttpRequest();
      x.open('POST', '/api/admin/upload?kind=' + kind);
      x.setRequestHeader('X-Requested-With', 'fetch');
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText); } catch (_) {}
        x.status < 300 ? resolve(j) : reject(new Error(j.error || 'Unggahan gagal'));
      };
      x.onerror = () => reject(new Error('Koneksi terputus saat mengunggah'));
      x.send(fd);
    });
  }

  /** Perkecil foto (maks 1800px) sebelum diunggah agar cepat dibuka di HP tamu. */
  async function prepImage(file, max = 1800) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (_) { return file; }
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (r === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
  }

  /** Ambil satu frame dari video sebagai poster (tampil saat video masih dimuat). */
  function posterFromVideo(url) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const fail = () => resolve(null);
      const timer = setTimeout(fail, 15000);
      v.addEventListener('error', fail);
      v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(3, (v.duration || 2) * 0.4); });
      v.addEventListener('seeked', () => {
        clearTimeout(timer);
        const w = Math.min(720, v.videoWidth);
        const hh = Math.round((w * v.videoHeight) / v.videoWidth);
        const c = document.createElement('canvas');
        c.width = w; c.height = hh;
        c.getContext('2d').drawImage(v, 0, 0, w, hh);
        c.toBlob((b) => resolve(b ? new File([b], 'poster.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.82);
      });
      v.src = url;
    });
  }

  /* ----------------------------------------------------------------- login */
  function renderLogin(msg) {
    const input = h('input', { class: 'input', type: 'password', id: 'pw', autocomplete: 'current-password', required: true, autofocus: true });
    const err = h('p', { class: 'err-text', role: 'alert' }, msg || '');
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Masuk');
    const form = h('form', { class: 'login-card' },
      h('h1', null, 'Dashboard Undangan'),
      h('p', null, 'Masukkan password admin untuk mengelola undangan.'),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'pw' }, 'Password'), input),
      err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      err.textContent = '';
      try {
        await api('/login', { method: 'POST', body: { password: input.value } });
        route();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        input.select();
      }
    });
    root.replaceChildren(h('div', { class: 'login' }, form));
    input.focus();
  }

  async function logout() {
    await api('/logout', { method: 'POST' }).catch(() => {});
    renderLogin();
  }

  /* ---------------------------------------------------------- daftar undangan */
  function topbar(...extra) {
    return h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('i'), 'Undangan Online'),
      extra,
      h('button', { class: 'btn small', onclick: logout }, 'Keluar'));
  }

  function statusPill(s) {
    if (s.status !== 'published') return h('span', { class: 'pill draft' }, 'Draf');
    if (s.hasUnpublished) return h('span', { class: 'pill warn' }, 'Terbit, ada perubahan');
    return h('span', { class: 'pill live' }, 'Terbit');
  }

  async function renderList() {
    root.replaceChildren(topbar(), h('div', { class: 'wrap' }, h('p', { class: 'hint' }, 'Memuat…')));
    let list, me;
    try {
      [list, me] = await Promise.all([api('/invitations'), fetch('/api/admin/me').then((r) => r.json())]);
    } catch (e) { return; }

    const cards = list.map((s) => {
      const url = `${location.origin}/undangan/${s.slug}`;
      const r = s.rsvp;
      const stats = r.total ? `${r.hadir} hadir (${r.guests} orang), ${r.ragu} ragu, ${r.tidak} tidak hadir` : 'Belum ada konfirmasi';
      return h('article', { class: 'card' },
        h('div', { class: 'thumb', style: s.poster ? { backgroundImage: `url("${s.poster}")` } : {} }),
        h('div', { style: { minWidth: 0 } },
          h('h3', null, s.title, ' ', statusPill(s)),
          h('p', { class: 'meta' }, [s.type, fmtDate(s.date)].filter(Boolean).join(', ')),
          h('div', { class: 'link' }, h('code', { title: url }, `/undangan/${s.slug}`),
            h('button', { class: 'icon-btn', 'aria-label': 'Salin link', title: 'Salin link', onclick: () => copyText(url, 'Link disalin') }, icon('copy'))),
          h('p', { class: 'stats' }, stats)),
        h('div', { class: 'actions' },
          h('a', { class: 'btn small primary', href: `#/edit/${s.id}` }, 'Edit'),
          s.status === 'published' && h('a', { class: 'btn small', href: `/undangan/${s.slug}`, target: '_blank', rel: 'noopener' }, 'Buka link'),
          h('button', { class: 'btn small', onclick: () => duplicate(s) }, 'Duplikat'),
          h('button', { class: 'btn small danger', onclick: () => remove(s) }, 'Hapus')));
    });

    root.replaceChildren(
      topbar(),
      h('main', { class: 'wrap' },
        me.defaultPassword && h('div', { class: 'banner' }, 'Anda masih memakai password bawaan. Sebelum online, jalankan server dengan ', h('code', null, 'ADMIN_PASSWORD="password-anda"'), '.'),
        h('div', { class: 'page-head' },
          h('div', null, h('h1', null, 'Undangan'), h('p', null, `${list.length} undangan. Satu desain, banyak acara.`)),
          h('button', { class: 'btn primary', onclick: () => createDialog(list) }, icon('plus'), 'Buat undangan')),
        cards.length ? h('div', { class: 'cards' }, cards) : h('div', { class: 'empty' }, 'Belum ada undangan. Klik "Buat undangan" untuk memulai.')));
  }

  async function createDialog(list, preset) {
    const result = await dialog((close) => {
      const title = h('input', { class: 'input', id: 'n-title', required: true, maxlength: 120, placeholder: 'Contoh: Rina & Dimas', value: (preset && preset.title) || '' });
      const slug = h('input', { class: 'input', id: 'n-slug', maxlength: 60, placeholder: 'rina-dimas' });
      let slugTouched = false;
      slug.addEventListener('input', () => { slugTouched = true; });
      title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
      if (title.value) slug.value = slugify(title.value);
      const from = h('select', { class: 'input', id: 'n-from' },
        h('option', { value: '' }, 'Isi contoh bawaan'),
        list.map((s) => h('option', { value: s.id, selected: preset && preset.copyFrom === s.id }, `Salin dari: ${s.title}`)));
      const err = h('p', { class: 'err-text', role: 'alert' });
      const form = h('form', { class: 'dlg' },
        h('h2', null, preset ? 'Duplikat undangan' : 'Buat undangan baru'),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'n-title' }, 'Nama acara atau mempelai'), title),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'n-slug' }, 'Link undangan'),
          h('div', { class: 'prefix' }, h('span', null, '/undangan/'), slug),
          h('span', { class: 'hint' }, 'Huruf kecil, angka, dan tanda hubung. Kosongkan agar dibuat otomatis.')),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'n-from' }, 'Mulai dari'), from),
        err,
        h('div', { class: 'btns' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Batal'), h('button', { class: 'btn primary', type: 'submit' }, 'Buat')));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          const rec = await api('/invitations', { method: 'POST', body: { title: title.value, slug: slug.value, copyFrom: from.value || undefined } });
          close(rec);
        } catch (ex) { err.textContent = ex.message; }
      });
      setTimeout(() => title.focus(), 30);
      return form;
    });
    if (result) { toast('Undangan dibuat'); location.hash = `#/edit/${result.id}`; }
  }

  function duplicate(s) {
    api('/invitations').then((list) => createDialog(list, { title: `${s.title} (salinan)`, copyFrom: s.id }));
  }

  async function remove(s) {
    if (!(await confirmDialog('Hapus undangan?', `"${s.title}" beserta semua RSVP dan ucapannya akan dihapus permanen. Link /undangan/${s.slug} tidak akan bisa dibuka lagi.`, 'Hapus permanen', true))) return;
    try { await api(`/invitations/${s.id}`, { method: 'DELETE' }); toast('Undangan dihapus'); renderList(); } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------------------------------------------------------- router */
  async function route() {
    let me;
    try { me = await (await fetch('/api/admin/me')).json(); } catch (_) { return toast('Tidak dapat terhubung ke server', 'err'); }
    if (!me.admin) return renderLogin();
    const m = /^#\/edit\/([a-f0-9]+)$/.exec(location.hash);
    if (m && window.Admin.renderEditor) return window.Admin.renderEditor(m[1]);
    renderList();
  }
  window.addEventListener('hashchange', () => {
    if (window.Admin.beforeLeave && !window.Admin.beforeLeave()) return;
    route();
  });

  window.Admin = { h, svg, icon, toast, copyText, dialog, confirmDialog, api, upload, prepImage, posterFromVideo, fmtDate, fmtStamp, slugify, topbar, statusPill, root, route, renderList };
})();
