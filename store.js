'use strict';
/**
 * Lapisan penyimpanan data.
 * Saat ini memakai satu file JSON (data/db.json) dengan penulisan atomik.
 * Cukup untuk ribuan undangan/RSVP. Jika nanti ingin SQLite/PostgreSQL,
 * ganti isi file ini saja — server.js hanya memakai fungsi-fungsi di bawah.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = { invitations: [], rsvps: [] };

function id() {
  return crypto.randomBytes(8).toString('hex');
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.invitations = db.invitations || [];
    db.rsvps = db.rsvps || [];
    return false;
  }
  return true; // database baru
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomik: file tidak pernah setengah tertulis
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

module.exports = {
  id,
  load,

  listInvitations() {
    return clone(db.invitations);
  },
  getInvitation(invId) {
    return clone(db.invitations.find((i) => i.id === invId));
  },
  getInvitationBySlug(slug) {
    return clone(db.invitations.find((i) => i.slug === slug));
  },
  slugTaken(slug, exceptId) {
    return db.invitations.some((i) => i.slug === slug && i.id !== exceptId);
  },
  insertInvitation(inv) {
    db.invitations.push(inv);
    save();
    return clone(inv);
  },
  updateInvitation(invId, patch) {
    const idx = db.invitations.findIndex((i) => i.id === invId);
    if (idx < 0) return null;
    db.invitations[idx] = { ...db.invitations[idx], ...patch, id: invId };
    save();
    return clone(db.invitations[idx]);
  },
  deleteInvitation(invId) {
    const before = db.invitations.length;
    db.invitations = db.invitations.filter((i) => i.id !== invId);
    db.rsvps = db.rsvps.filter((r) => r.invitationId !== invId);
    if (db.invitations.length !== before) save();
    return db.invitations.length !== before;
  },

  listRsvps(invId) {
    return clone(
      db.rsvps
        .filter((r) => r.invitationId === invId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  },
  insertRsvp(r) {
    db.rsvps.push(r);
    save();
    return clone(r);
  },
  deleteRsvp(invId, rid) {
    const before = db.rsvps.length;
    db.rsvps = db.rsvps.filter((r) => !(r.id === rid && r.invitationId === invId));
    if (db.rsvps.length !== before) save();
    return db.rsvps.length !== before;
  },
};
