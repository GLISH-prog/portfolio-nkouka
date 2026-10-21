import readline from "node:readline";
import { configureAdmin, init } from "../src/db.js";

const tty = process.stdin.isTTY;
const rl = tty ? null : readline.createInterface({ input: process.stdin });
const lines = [];
if (rl) rl.on("line", (l) => lines.push(l));

function ask(q, hidden = false) {
  process.stdout.write(q);
  if (!tty) return new Promise((res) => { const t = setInterval(() => { if (lines.length) { clearInterval(t); process.stdout.write("\n"); res(lines.shift()); } }, 20); });
  return new Promise((res) => {
    const s = process.stdin; let v = "";
    s.setRawMode(true); s.resume(); s.setEncoding("utf8");
    const on = (chunk) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") { s.setRawMode(false); s.pause(); s.off("data", on); process.stdout.write("\n"); return res(v); }
        if (c === "\u0003") process.exit(1);
        if (c === "\u007f" || c === "\b") { if (v) { v = v.slice(0, -1); if (!hidden) process.stdout.write("\b \b"); } continue; }
        v += c; if (!hidden) process.stdout.write(c);
      }
    };
    s.on("data", on);
  });
}

console.log("\nCréation du compte administrateur\n");
const email = (await ask("Email : ")).trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Email invalide."); process.exit(1); }
const pw = await ask("Mot de passe (12 caractères minimum) : ", true);
if (pw.length < 12) { console.error("Mot de passe trop court."); process.exit(1); }
const pw2 = await ask("Confirme le mot de passe : ", true);
if (pw !== pw2) { console.error("Les mots de passe ne correspondent pas."); process.exit(1); }

await init();
await configureAdmin(email, pw);
console.log("\nCompte créé. Lance maintenant : npm start\n");
process.exit(0);
