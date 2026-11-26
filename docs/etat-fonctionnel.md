# État fonctionnel de la révision

Cette page décrit l’écart entre le cahier des charges MVP (`docs/00` à `docs/13`) et l’application présente dans ce dépôt. Les fonctionnalités listées comme partielles ont une API ou un écran, mais pas encore tous les états, contrôles, tests ou contraintes exigés.

| Domaine | Disponible dans cette révision | À construire / valider |
|---|---|---|
| Socle | Tokens Vercel centralisés, coquille sidebar/topbar/mobile, `⌘K`/`Ctrl+K`, pages système, proxy de session, CSP avec nonce, migration Drizzle initiale, erreurs API normalisées, permissions atomiques testées | CI, Husky, gitleaks, Playwright, audits, licence, budget de performance, ESLint taille de fichiers |
| Connexion | Google via Better Auth, pseudo avec disponibilité en direct, onboarding reprenable en 3 étapes, page `/unlock`, clé de récupération, changement de phrase | `email_verified` explicite, cookie cache/prefix, proxy OAuth affiné, sessions multi-onglets complètes, handle modifiable 1×/30 j |
| Coffre | Coffre personnel chiffré, liste des coffres, déverrouillage par phrase ou récupération | Coffres multiples, métadonnées chiffrées, corbeille/archivage, membres/rôles, transfert, rotation de coffre |
| Secrets | Création, édition versionnée, suppression, historique, restauration, recherche locale, révélation 10 s, copie 30 s | Catégories, champs par catégorie, tags, notes, favoris, archivage, déplacement, doublon, générateur, diff masqué, page dédiée complète |
| Projets et environnements | Création, renommage, suppression logique, environnements chiffrés, éditeur de fichier ENV, import/export sans altération | Kanban, DnD clavier, comparateur sans valeurs, duplication, déplacement, historique ENV, import multi-fichiers |
| Partage | Coffre `read`/`write`, partage ciblé secret/projet en lecture seule, liens privés + QR + code + limite Redis, groupes, révocation, permissions atomiques stockées | Rôles appliqués partout, exceptions complètes, invitations dédiées, journaux d’usage, rotation projet/coffre, empreintes/TOFU |
| Sécurité | Sessions, révocation, journal d’activité, sauvegarde chiffrée, verrouillage à l’inactivité, rédaction des logs | Réglages (délais, thème, densité), régénération de clé de récupération, rate limiting général, RLS, audit externe |

Avant d’annoncer une fonction comme terminée, ajouter son interface complète, son endpoint autorisé, ses états d’erreur/chargement/vide et ses tests.
