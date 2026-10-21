import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PROFILE } from "./src/defaults.js";
import { configureAdmin, db, getSetting, init, setSetting } from "./src/db.js";

const root = path.dirname(fileURLToPath(import.meta.url));
await init();

// Hébergeur sans terminal : ADMIN_EMAIL + ADMIN_PASSWORD créent le compte au premier démarrage.
if (!(await getSetting("admin_hash")) && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  if (process.env.ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD : 12 caractères minimum");
  await configureAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  console.log("Compte admin créé depuis les variables d’environnement.");
}
if (!(await getSetting("admin_hash"))) console.warn("\n⚠  Aucun compte admin. Lance d’abord : npm run setup\n");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
app.use(express.json({ limit: "100kb" }));
// Anti-CSRF : toute écriture doit être du JSON (+ cookie SameSite=Strict).
app.use("/api", (req, res, next) =>
  req.method === "GET" || req.is("application/json") ? next() : res.status(415).json({ error: "JSON requis." }));

/* ---------- session (jeton signé HMAC dans un cookie httpOnly) ---------- */
const COOKIE = "sid", DAY = 864e5;
const sign = (secret, p) => crypto.createHmac("sha256", secret).update(p).digest("base64url");
const makeToken = (secret, email) => {
  const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 7 * DAY })).toString("base64url");
  return `${p}.${sign(secret, p)}`;
};
function readToken(secret, t) {
  if (!secret || !t) return null;
  const [p, s] = t.split(".");
  if (!p || !s) return null;
  const good = sign(secret, p);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url")); return o.x > Date.now() ? o : null; } catch { return null; }
}
const getCookie = (req, n) => (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === n)?.[1];

async function requireAdmin(req, res, next) {
  const [secret, email] = await Promise.all([getSetting("secret"), getSetting("admin_email")]);
  const s = readToken(secret, getCookie(req, COOKIE));
  if (!s || s.e !== email) return res.status(401).json({ error: "Non connecté." });
  next();
}

/* ---------- limiteur de tentatives (en mémoire) ---------- */
const hits = new Map();
const blocked = (k) => { const h = hits.get(k); return !!h && h.reset > Date.now() && h.n >= 5; };
const fail = (k) => { const h = hits.get(k); if (!h || h.reset < Date.now()) hits.set(k, { n: 1, reset: Date.now() + 15 * 60 * 1000 }); else h.n++; };

app.post("/api/login", async (req, res) => {
  const ip = req.ip;
  if (blocked(ip)) return res.status(429).json({ error: "Trop de tentatives. Réessaie dans 15 minutes." });
  const { email = "", password = "" } = req.body || {};
  const [adminEmail, hash, secret] = await Promise.all([getSetting("admin_email"), getSetting("admin_hash"), getSetting("secret")]);
  const ok = await bcrypt.compare(String(password), hash || "");
  if (!adminEmail || !ok || String(email).trim().toLowerCase() !== adminEmail) {
    fail(ip);
    return res.status(401).json({ error: "Identifiants invalides." });
  }
  hits.delete(ip);
  res.cookie(COOKIE, makeToken(secret, adminEmail), { httpOnly: true, sameSite: "strict", secure: req.secure, maxAge: 7 * DAY, path: "/" });
  res.json({ ok: true });
});
app.post("/api/logout", (_req, res) => { res.clearCookie(COOKIE, { path: "/" }); res.json({ ok: true }); });

/* ---------- validation ---------- */
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const url = (v) => { const s = str(v, 500); return s === "" || /^(https?:\/\/|\/)/i.test(s) ? s : null; };
const list = (v, n = 30, l = 80) => (Array.isArray(v) ? v : []).map((x) => str(x, l)).filter(Boolean).slice(0, n);
const entries = (v) => (Array.isArray(v) ? v : []).map((e) => ({ period: str(e?.period, 60), title: str(e?.title, 120), place: str(e?.place, 120) })).filter((e) => e.title).slice(0, 30);

function cleanProject(b = {}) {
  const title = str(b.title, 120);
  if (!title) return { error: "Le titre est obligatoire." };
  const [cover, live, repo] = [url(b.coverUrl), url(b.liveUrl), url(b.repoUrl)];
  if ([cover, live, repo].includes(null)) return { error: "Lien invalide (http(s):// ou /chemin)." };
  return { v: [title, ["web", "graphisme", "autre"].includes(b.category) ? b.category : "web", str(b.summary, 300), str(b.description, 5000), cover, live, repo,
    JSON.stringify(list(b.tags, 12, 30)), b.featured ? 1 : 0, b.published ? 1 : 0, Math.max(0, Math.min(9999, parseInt(b.sortOrder) || 0))] };
}
function cleanProfile(b = {}) {
  const fullName = str(b.fullName, 120);
  if (!fullName) return { error: "Le nom est obligatoire." };
  const email = str(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email invalide." };
  const [gh, li, ig, be, ph] = ["github", "linkedin", "instagram", "behance", "photoUrl"].map((k) => url(b[k]));
  if ([gh, li, ig, be, ph].includes(null)) return { error: "Lien invalide (http(s):// ou /chemin)." };
  return { v: { fullName, title: str(b.title, 200), bio: str(b.bio, 2000), photoUrl: ph || DEFAULT_PROFILE.photoUrl, email, phone: str(b.phone, 40),
    location: str(b.location, 120), github: gh, linkedin: li, instagram: ig, behance: be, skills: list(b.skills), languages: list(b.languages),
    education: entries(b.education), experience: entries(b.experience) } };
}

/* ---------- données ---------- */
const COLS = "title, category, summary, description, cover_url, live_url, repo_url, tags, featured, published, sort_order";
const toProject = (r) => ({ id: Number(r.id), title: r.title, category: r.category, summary: r.summary, description: r.description,
  coverUrl: r.cover_url, liveUrl: r.live_url, repoUrl: r.repo_url, tags: JSON.parse(r.tags || "[]"),
  featured: !!r.featured, published: !!r.published, sortOrder: Number(r.sort_order) });
const getProfile = async () => ({ ...DEFAULT_PROFILE, ...JSON.parse((await getSetting("profile")) || "{}") });
const allProjects = async (where = "") => (await db.execute(`SELECT id, ${COLS} FROM projects ${where} ORDER BY sort_order ASC, created_at DESC, id DESC`)).rows.map(toProject);

app.get("/api/site", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ profile: await getProfile(), projects: await allProjects("WHERE published = 1") });
});

const admin = express.Router();
admin.use(requireAdmin);
admin.get("/me", (_req, res) => res.json({ ok: true }));
admin.get("/profile", async (_req, res) => res.json(await getProfile()));
admin.put("/profile", async (req, res) => {
  const c = cleanProfile(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  await setSetting("profile", JSON.stringify(c.v));
  res.json(c.v);
});
admin.get("/projects", async (_req, res) => res.json(await allProjects()));
admin.post("/projects", async (req, res) => {
  const c = cleanProject(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  const r = await db.execute({ sql: `INSERT INTO projects (${COLS}) VALUES (${c.v.map(() => "?").join(",")})`, args: c.v });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
admin.put("/projects/:id", async (req, res) => {
  const id = Number(req.params.id), c = cleanProject(req.body);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Identifiant invalide." });
  if (c.error) return res.status(400).json({ error: c.error });
  const set = COLS.split(", ").map((k) => `${k} = ?`).join(", ");
  await db.execute({ sql: `UPDATE projects SET ${set} WHERE id = ?`, args: [...c.v, id] });
  res.json({ ok: true });
});
admin.delete("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Identifiant invalide." });
  await db.execute({ sql: "DELETE FROM projects WHERE id = ?", args: [id] });
  res.json({ ok: true });
});
app.use("/api/admin", admin);
app.use("/api", (_req, res) => res.status(404).json({ error: "Introuvable." }));

app.use(express.static(path.join(root, "public")));
app.use((err, _req, res, _next) => { console.error(err); res.status(err.status || 500).json({ error: "Erreur serveur." }); });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`\nSite : http://localhost:${port}\nAdmin : http://localhost:${port}/admin/\n`));
