# 01 — Produit et périmètre

## 1. Vision

Un espace privé pour tous les secrets numériques d'un développeur : clés API, tokens, mots de passe, identifiants de bases de données, clés SSH, certificats, fichiers `.env`. Utilisable seul, avec un proche, ou en équipe.

Problèmes résolus : `.env` dispersés, clés envoyées par WhatsApp/Telegram, mots de passe partagés par e-mail, anciens accès jamais révoqués.

## 2. Ce qui change par rapport aux spécifications précédentes

| Avant | Maintenant |
|---|---|
| Inscription par pseudo + mot de passe ou passkey, sans e-mail | **Connexion uniquement via Google** |
| Pseudo = identité de création de compte | Pseudo (`@handle`) choisi **après** la première connexion Google, sert au partage |
| Mot de passe maître = connexion | **Phrase secrète = déverrouillage du coffre uniquement**, jamais envoyée au serveur |
| E-mail facultatif | E-mail Google reçu à la connexion, **jamais affiché aux autres utilisateurs**, jamais utilisé pour inviter |

Le partage reste **sans échange d'e-mail** : par `@pseudo`, lien privé ou QR code.

## 3. Hiérarchie des données

`Compte → Coffres → Projets → Environnements → Secrets`

- Un coffre contient des projets **et/ou** des secrets directs (secrets indépendants autorisés).
- Un projet contient 1 à 10 environnements (Development, Staging, Production, Testing, Custom).
- Un coffre est **personnel** (1 membre) ou **partagé** (≥2 membres). Un coffre personnel peut devenir partagé ; l'inverse est possible si un seul membre reste.
- On peut partager : un secret, un projet, ou un coffre entier.

## 4. Fonctionnalités (toutes obligatoires)

### F1 — Accès
- F1.1 Page de présentation. F1.2 Connexion Google. F1.3 Onboarding : choix du pseudo, création de la phrase secrète, clé de récupération, confirmation de sauvegarde. F1.4 Déverrouillage du coffre (phrase secrète ou clé de récupération). F1.5 Verrouillage automatique et manuel. F1.6 Déconnexion. F1.7 Suppression du compte.

### F2 — Coffres
Créer, renommer, description, icône + couleur (palette tokens), archiver, supprimer (corbeille 30 jours), restaurer, membres (ajout, retrait, rôle), transfert de propriété, quitter un coffre partagé.

### F3 — Projets et environnements
CRUD projet (nom, description, icône, tags). CRUD environnement. Dupliquer un environnement. Déplacer un projet entre coffres (rechiffrement des clés).

### F4 — Secrets
Catégories : Passwords, API Keys, Tokens, Emails, Databases, SSH, Certificates, Infrastructure, ENV, Custom.
Opérations : créer, modifier, consulter, masquer/révéler, copier (effacement presse-papiers 30 s), dupliquer, déplacer, tags, notes, favori, partager, archiver, supprimer, historique et restauration de version.
Chaque secret : id, nom, type, valeur chiffrée, description, métadonnées personnalisées, tags, coffre, projet/environnement facultatifs, créateur, dates, version.

### F5 — Gestionnaire ENV
- Import : `.env`, `.env.local`, `.env.development`, `.env.production`, fichiers dotenv custom, coller du texte, multi-fichiers, association à un environnement.
- Éditeur : ajout/suppression/modification, masquage, recherche, doublons, validation de format.
- Export `.env` **sans altération** : commentaires, lignes vides, guillemets, caractères spéciaux, retours à la ligne préservés (parser sans perte, voir 10).
- Comparateur entre deux environnements : présente / absente / modifiée, **sans exposer les valeurs**.
- Versions précédentes et restauration.

### F6 — Partage
- Niveaux : secret, projet, coffre.
- Invitations : par `@pseudo`, par lien privé, par QR code. Jamais par e-mail.
- Permissions atomiques : `view`, `reveal`, `copy`, `create`, `update`, `delete`, `share`, `manage`.
- Rôles : Lecteur, Utilisateur, Éditeur, Administrateur, Propriétaire (ensembles de permissions, **pas** le mécanisme de sécurité).
- Exceptions par membre.
- Groupes (Amis, Famille, Équipe…).
- Liens privés : expiration, nombre d'usages max, code d'accès facultatif, révocation, journal d'usage, fragment `#` contenant la clé.
- Mode consultation ; mode utilisation (sans révélation) **hors MVP**, jamais présenté comme protection absolue.
- Désactivation de la copie = restriction d'interface, pas une garantie. Le dire dans l'UI.

### F7 — Recherche globale
`⌘K` / `Ctrl+K`. Noms, projets, coffres, tags, catégories, noms de variables ENV, descriptions. **Recherche exécutée localement** sur les métadonnées déchiffrées (l'index n'existe qu'en mémoire client). Filtres : personnel/partagé, projet, environnement, catégorie, favoris, archivés, date.

### F8 — Activité et audit
Événements : création, modification, suppression, restauration, partage, acceptation, révocation, changement de permission, export, consultation (si observable), rotation de clé, connexion, verrouillage échoué. **Aucune valeur, clé ou fragment** dans les journaux.

### F9 — Sécurité du compte
Sessions actives (liste, révocation), appareils, clé de récupération (régénération), changement de phrase secrète, export chiffré du coffre, suppression de compte.

## 5. MVP (livrable v1.0)

Tout F1, F2, F3, F4, F5, F7, F8, F9, et F6 sauf mode utilisation et sync GitHub. Les liens/QR sont inclus. Les groupes sont inclus.

## 6. Hors MVP (ne pas coder, ne pas casser l'architecture)

Synchronisation GitHub (écriture seule, via CLI locale ensuite), CLI, extensions IDE, mode utilisation sans révélation, passkey comme second moyen de déverrouillage (PRF), application mobile native, SSO d'entreprise.

## 7. Limites assumées (à afficher, ne pas cacher)

- Un secret déjà déchiffré par quelqu'un ne peut pas être « repris » : la révocation protège les **futures** versions ; il faut régénérer la clé chez le fournisseur.
- Perte de la phrase secrète **et** de la clé de récupération = perte définitive des données. Aucune porte dérobée.
- Le presse-papiers n'est pas un canal sûr.
- Se connecter avec Google prouve l'identité, il **ne déverrouille rien**.
