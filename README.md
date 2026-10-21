# Portfolio — NKOUKA Dieu De Grâce

Site en HTML / CSS / JavaScript, avec un tableau de bord d'administration (Tailwind) et un petit serveur Node.
Aucun fichier `.env` à remplir.

## Démarrer (3 commandes, à lancer dans ce dossier)
```
npm install
npm run setup     # te demande ton email et ton mot de passe (12 caractères minimum)
npm start
```
- Site : http://localhost:3000
- Administration : http://localhost:3000/admin/

Il faut Node.js 20 ou plus : https://nodejs.org

## Utilisation
- **Projets** : créer, modifier, publier (ou laisser en brouillon), supprimer. Seuls les projets publiés s'affichent sur le site.
- **Profil** : nom, accroche, à propos, photo, contacts, compétences, langues, formations, expériences.
- **Images** : mets tes fichiers dans `public/images/` et indique leur chemin (ex. `/images/projet1.jpg`), ou colle un lien https://.
- Les données sont dans `data/portfolio.db` (SQLite). Sauvegarde ce fichier pour garder ton contenu.

## Mettre en ligne
L'hébergeur doit faire tourner Node.js (Render, Railway, Fly.io…). Variables à définir :
- `ADMIN_EMAIL` et `ADMIN_PASSWORD` : créent le compte admin au premier démarrage (12 caractères minimum pour le mot de passe).
- Pour que les données survivent aux redémarrages, utilise Turso (base SQLite en ligne) : `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN`.
- Commande de démarrage : `npm start`.
- Sers le site en HTTPS (les hébergeurs ci-dessus le font automatiquement).

## Changer le mot de passe
Relance `npm run setup` : le compte est mis à jour et toutes les sessions ouvertes sont déconnectées.

## Sécurité (résumé)
Mot de passe chiffré (bcrypt), session dans un cookie `HttpOnly` / `SameSite=Strict`, API admin protégée,
5 tentatives de connexion max par 15 minutes, liens validés, contenu échappé à l'affichage.
Le limiteur de tentatives est en mémoire (réinitialisé au redémarrage du serveur).
