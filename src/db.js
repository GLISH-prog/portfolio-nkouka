import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";

// SQLite local par défaut ; Turso si TURSO_DATABASE_URL est défini.
const url = process.env.TURSO_DATABASE_URL || "file:data/portfolio.db";
if (url.startsWith("file:")) fs.mkdirSync("data", { recursive: true });
export const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

export async function init() {
  await db.batch([
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'web',
      summary TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '', live_url TEXT NOT NULL DEFAULT '', repo_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  ]);
}

export async function getSetting(key) {
  const r = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return r.rows[0]?.value ?? null;
}
export async function setSetting(key, value) {
  await db.execute({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [key, String(value)] });
}

/** Crée ou met à jour le compte admin (et invalide les anciennes sessions). */
export async function configureAdmin(email, password) {
  await setSetting("admin_email", email.trim().toLowerCase());
  await setSetting("admin_hash", await bcrypt.hash(password, 12));
  await setSetting("secret", crypto.randomBytes(48).toString("base64url"));
}
