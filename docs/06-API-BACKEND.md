# 06 — API backend

## 1. Conventions

- Route Handlers Next.js, préfixe `/api/v1`. JSON uniquement. Types d'entrée/sortie = schémas Zod du module.
- Authentification : cookie de session (voir 03). Chaque endpoint déclare explicitement `requireSession()` ; aucun endpoint métier public hors `/api/v1/links/:token` (accès par jeton) et `/api/auth/*`.
- **Autorisation dans le service**, jamais dans le controller ni le frontend : `permissions.can(user, action, resource)` appelé avant toute lecture/écriture. Réponse `404` (pas `403`) quand l'existence même de la ressource ne doit pas fuiter.
- Mutations : vérification `Origin`/`Sec-Fetch-Site`, en-tête `Content-Type: application/json` obligatoire.
- Idempotence : `Idempotency-Key` accepté sur créations de partage/lien/rotation.
- Concurrence : `If-Match: <version>` (ou champ `expectedVersion`) sur modifications de secrets et d'environnements ; `409 CONFLICT` si périmé.
- Pagination par curseur (`?cursor=&limit=`), `limit` défaut 50, max 200.
- Toutes les réponses : `Cache-Control: no-store`.
- Format d'erreur unique : `{ "error": { "code": "FORBIDDEN", "message": "…générique…", "requestId": "…" } }`.

## 2. Endpoints (MVP)

### Identité
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/me` | Profil + étape d'onboarding + statut des clés |
| PUT | `/me/handle` | Choisir/modifier le pseudo |
| GET | `/handles/check?h=` | Disponibilité (rate-limité) |
| PATCH | `/me/profile` | Nom d'affichage, avatar, bio |
| GET | `/users/search?q=` | Recherche par pseudo (préfixe, 20 max, **jamais d'e-mail**) |
| GET | `/users/:handle` | Profil public + clé publique + empreinte |
| DELETE | `/me` | Suppression du compte |

### Clés et récupération
| POST | `/me/keys` | Enregistrer le matériel de clés (onboarding) — transaction avec création du coffre personnel |
| GET | `/me/keys` | Récupérer les enveloppes pour déverrouiller |
| PUT | `/me/keys/passphrase` | Changement de phrase (nouvelle enveloppe d'AK) |
| PUT | `/me/keys/recovery` | Régénération de la clé de récupération |
| POST | `/me/export` | Préparer l'export chiffré (blobs), assemblage côté client |

### Coffres, projets, environnements
`GET/POST /vaults`, `GET/PATCH/DELETE /vaults/:id`, `POST /vaults/:id/archive|restore`, `POST /vaults/:id/transfer`, `POST /vaults/:id/leave`, `GET/POST /vaults/:id/members`, `PATCH/DELETE /vaults/:id/members/:userId`, `POST /vaults/:id/rotate` (démarre), `GET /vaults/:id/rotate/status`, `POST /vaults/:id/rotate/batch`.
`GET/POST /vaults/:id/projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/move`.
`GET/POST /projects/:id/environments`, `PATCH/DELETE /environments/:id`, `POST /environments/:id/duplicate`.

### Secrets
`GET /vaults/:id/secrets?env=&category=&q=&cursor=` (métadonnées chiffrées), `POST /secrets`, `GET /secrets/:id`, `PATCH /secrets/:id` (nouvelle version), `DELETE /secrets/:id`, `POST /secrets/:id/restore`, `POST /secrets/:id/move`, `POST /secrets/:id/duplicate`, `GET /secrets/:id/versions`, `POST /secrets/:id/versions/:v/restore`, `PUT/DELETE /secrets/:id/favorite`.
`POST /environments/:id/env-import` (lot de secrets chiffrés + layout chiffré), `GET /environments/:id/env-export` (blobs + layout, assemblage en clair **côté client**), `POST /environments/diff` (voir §4).

### Partage
`POST /invitations` (par `handle`), `GET /invitations?status=`, `POST /invitations/:id/accept|decline|revoke`.
`POST /links`, `GET /links`, `DELETE /links/:id` (révocation), `GET /links/:id/uses`, `GET /l/:token/payload` (public, rate-limité, vérifie expiration/usages/code ; incrémente l'usage de façon atomique).
`GET/POST /groups`, `PATCH/DELETE /groups/:id`, `POST/DELETE /groups/:id/members`.
`GET /shared` (reçus), `GET /sharing` (émis), `PATCH /share-members/:id` (permissions), `DELETE /share-members/:id`.

### Activité et sessions
`GET /activity?vaultId=&event=&cursor=`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `DELETE /me/sessions` (toutes sauf la courante).

## 3. Validation (Zod) — limites

| Champ | Min | Max |
|---|---|---|
| Pseudo | 3 | 20 |
| Nom d'affichage | 1 | 50 |
| Bio | 0 | 160 |
| Blob de nom/description (chiffré) | 1 o | 4 Kio |
| Valeur de secret (chiffrée) | 0 | **64 Kio** (certificats/clés SSH inclus) |
| Notes (chiffrées) | 0 | 16 Kio |
| Tags par objet | 0 | 20 (chacun ≤ 32 car.) |
| Champs personnalisés par secret | 0 | 30 |
| Secrets par environnement | 0 | 500 |
| Secrets par coffre | 0 | 5 000 |
| Environnements par projet | 1 | 10 |
| Projets par coffre | 0 | 200 |
| Coffres possédés par utilisateur | 1 | 50 |
| Membres par coffre | 1 | 100 |
| Groupes par utilisateur | 0 | 50 ; membres par groupe ≤ 100 |
| Fichier `.env` importé | 1 o | **512 Kio**, ≤ 1 000 lignes utiles |
| Versions conservées par secret | — | 50 |
| Liens actifs par utilisateur | 0 | 100 |
| Durée d'un lien | 5 min | 30 jours |
| Usages max d'un lien | 1 | 100 |
| Durée d'une invitation | 1 h | 14 jours |
| Taille d'un corps JSON | — | 1 Mio (5 Mio pour import/rotation par lot) |

Les valeurs dépassant les limites sont refusées avec `413` ou `422`, jamais tronquées silencieusement. Les limites sont des **constantes uniques** (`lib/limits.ts`) partagées par serveur et client.

## 4. Comparateur d'environnements sans exposer les valeurs

Les noms de variables étant chiffrés, le serveur ne peut pas comparer. **La comparaison se fait côté client** après déchiffrement des noms ; pour les « valeurs modifiées », le client compare des **empreintes HMAC** calculées localement (HMAC(VK, valeur)) stockées dans les métadonnées chiffrées — l'UI affiche seulement « Identique / Différente / Absente ». Aucune valeur n'est rendue dans le résultat.

## 5. Rate limiting

| Cible | Limite |
|---|---|
| `/api/auth/*` | 10 / min / IP |
| `/handles/check`, `/users/search` | 30 / min / utilisateur |
| `/l/:token/payload` | 10 / min / IP **et** 5 échecs de code → blocage 15 min du lien |
| Mutations générales | 120 / min / utilisateur |
| Imports / rotations | 10 / heure / utilisateur |
| Invitations | 30 / heure / utilisateur |

Réponse `429` avec `Retry-After`. Compteurs sur Redis/Upstash ou table dédiée ; documenter le choix.

## 6. Audit

Chaque mutation écrit un événement dans la **même transaction**. Liste blanche des métadonnées : `role`, `permissions`, `targetKind`, `count`, `keyVersion`. Le test « audit propre » (04 §8) tourne en CI.

## 7. Santé et exploitation

`GET /api/health` (sans donnée), journal structuré avec `requestId` propagé, métriques OpenTelemetry (durées, erreurs, rate-limit), alertes sur pics de `RATE_LIMITED`, échecs de déverrouillage de lien, erreurs 5xx.

## 8. Contrat de test par endpoint

Chaque endpoint a : un test nominal, un test non authentifié (401), un test non autorisé (403/404), un test de validation (422), un test de conflit si applicable (409), un test de rate limit si applicable (429), et un test vérifiant l'absence de secret dans la réponse et les logs.
