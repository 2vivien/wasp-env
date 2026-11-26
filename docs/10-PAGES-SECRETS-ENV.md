# 10 — Pages secrets et gestionnaire ENV

---

## P11 — Recherche globale (palette) `⌘K`

**But** : atteindre n'importe quel objet sans naviguer.
**Comportement** : modale 640 px, champ autofocus. Recherche **locale** (index mémoire MiniSearch sur métadonnées déchiffrées) — instantanée, aucune requête serveur par frappe.
**Résultats groupés** : Secrets · Projets · Coffres · Variables ENV · Actions (« Nouveau secret », « Importer un .env », « Verrouiller »…). Chaque ligne : nom, chemin, badge catégorie. Valeurs jamais indexées ni affichées.
**Filtres** : préfixes tapés (`@projet:`, `#tag`, `cat:`, `env:`) + puces de filtre cliquables : Personnel/Partagé, Projet, Environnement, Catégorie, Favoris, Archivés, Date.
**Clavier** : ↑↓ Entrée Échap ; `Tab` passe aux filtres ; `⌘↵` ouvre dans un nouvel onglet.
**États** : index en construction (« Préparation… », < 1 s pour 5 000 objets) ; aucun résultat → « Aucun résultat pour “x” » + action « Créer un secret “x” » ; verrouillé → la palette n'est pas disponible (redirection `/unlock`).

---

## P12 — Tous les secrets `/secrets`

**But** : inventaire complet, filtrable.
**Mise en page** : en-tête (titre, « Nouveau secret »), barre de filtres (Coffre, Projet, Environnement, Catégorie, Tag, Favoris, Archivés, Personnel/Partagé), recherche locale. **DataTable** virtualisée.
**Colonnes** : ★ favori, Nom (mono), Catégorie, Chemin (Coffre › Projet › Env), Partagé (oui/avec qui, nombre), Modifié. Colonne Valeur **absente** du tableau (jamais de valeur dans une liste).
**Actions de ligne** : Ouvrir, Copier, Dupliquer, Déplacer, Partager, Archiver, Supprimer. Sélection multiple → barre d'actions groupées : Déplacer, Taguer, Archiver, Supprimer (confirmation avec décompte).
**Tri** : modifié (défaut), nom, catégorie. Pagination par curseur côté données chiffrées, tri/filtre fin côté client.
**États** : vide → « Aucun secret. » + « Nouveau secret » + « Importer un .env » ; filtre sans résultat → « Aucun secret ne correspond » + « Réinitialiser les filtres ».
**Hooks** : `useSecrets`, `useSecretFilters`, `useBulkSelection`.

---

## P13 — Fiche d'un secret `/secrets/[secretId]` (aussi en Sheet latéral)

**But** : consulter et gérer un secret.
**En-tête** : nom (mono, éditable en ligne), badge catégorie, étoile favori, chemin cliquable, statut (Actif / Archivé), boutons « Partager », menu « Plus » (Dupliquer, Déplacer, Archiver, Supprimer).
**Corps (selon la catégorie)** :
- Champ **Valeur** (SecretValue) : « Révéler » (remasquage 10 s, décompte), « Copier » (effacement 30 s, toast « Copié, sera effacé dans 30 s »).
- Champs spécifiques par catégorie (voir tableau) ; chacun masquable individuellement.
- Description, tags, notes (Markdown simple, rendu **sans HTML**, chiffré).
- Champs personnalisés (clé/valeur, 30 max, option « secret » par champ).
- Métadonnées : créé par, créé le, modifié le, version.
**Onglets** : Détails · Versions · Partage · Activité.
- **Versions** : liste (version, date, auteur) ; sélectionner → comparer avec l'actuelle **en masquant les valeurs** (« Valeur modifiée ») ; « Restaurer cette version » crée une **nouvelle** version (jamais de réécriture d'historique).
- **Partage** : qui a accès (utilisateurs, groupes, liens actifs) avec permissions, bouton « Gérer ».
- **Activité** : événements de ce secret.

**Champs par catégorie**
| Catégorie | Champs |
|---|---|
| Passwords | Service, URL, identifiant, mot de passe, TOTP (secret base32 facultatif) |
| API Keys | Fournisseur, nom de la variable, clé, portée/permissions, date d'expiration |
| Tokens | Type (JWT/OAuth/Bearer), jeton, émetteur, expiration |
| Emails | Adresse, mot de passe, serveur SMTP/IMAP, port |
| Databases | Moteur, hôte, port, base, utilisateur, mot de passe, URL de connexion complète |
| SSH | Hôte, utilisateur, port, clé privée (zone multiligne), phrase de passe |
| Certificates | Certificat, clé privée, chaîne, expiration |
| Infrastructure | Type (FTP/DNS/S3/serveur), hôte, identifiants, région/bucket |
| ENV | Nom, valeur (géré par l'éditeur ENV) |
| Custom | Champs libres |

**Édition** : bouton « Modifier » → formulaire plein ; « Enregistrer » crée une nouvelle version ; conflit de version → dialogue « Ce secret a changé. Voir la différence / Écraser / Annuler » (sans exposer les valeurs dans la différence).
**Création** : Sheet « Nouveau secret » — étape 1 catégorie (grille de choix à libellés), étape 2 champs ; destination (Coffre/Projet/Environnement, préremplie par le contexte) ; générateur de mot de passe intégré (longueur 8–128, jeux de caractères, phrase aléatoire).
**Validation** : nom ≤ 128 ; valeur ≤ 64 Kio ; URL/port valides ; avertissement (non bloquant) sur valeur identique à un autre secret.
**États** : verrouillé → `/unlock` ; secret introuvable/non autorisé → page 404 neutre ; déchiffrement impossible → message dédié sans détails.
**Cas limites** : secret partagé avec permission `view` sans `reveal` → valeur affichée « Non révélable » ; sans `copy` → bouton Copier absent (et mention « restriction d'interface ») ; archivé → lecture seule + « Restaurer ».

---

## P14 — Variables ENV `/env` (hub) et éditeur `/projects/[id]/environments/[envId]`

### Hub `/env`
Liste des environnements de tous les projets (tableau : Projet, Environnement, nb de variables, modifié) + boutons « Importer un .env ». Raccourci vers l'éditeur et le comparateur.

### Éditeur d'un environnement
**En-tête** : « Allokan / Production » (fil d'Ariane), compteurs « 12 variables · 3 modifiées non enregistrées », boutons : « Importer », « Exporter », « Ajouter », « Comparer », « Enregistrer » (primaire, actif si modifications).
**Zone d'édition** : deux modes (bascule) — **Tableau** (Nom | Valeur masquée | actions) et **Texte brut** (éditeur mono type `.env`, valeurs masquées par défaut par une couche de masquage, bouton « Tout révéler 10 s »).
**Fonctions** :
1. Détection automatique des variables à l'import/collage.
2. **Doublons** surlignés avec lien « Garder la dernière / la première ».
3. **Validation** : nom `^[A-Za-z_][A-Za-z0-9_]*$`, ligne mal formée signalée avec numéro.
4. Recherche par nom (locale).
5. Copie individuelle.
6. Historique de versions (panneau « Versions » : restaurer l'état d'un jour donné).
7. Indicateur « modifié non enregistré » par ligne ; avertissement avant de quitter.

### Import
Sheet « Importer » : zone de dépôt multi-fichiers (`.env`, `.env.local`, `.env.development`, `.env.production`, dotenv custom) **et** champ « Coller le contenu ».
Étapes : 1) choix des fichiers/collage → 2) **association à un environnement existant** (auto-suggestion d'après le nom : `.env.production` → Production) → 3) **aperçu** (variables détectées, doublons, erreurs, **valeurs masquées**) → 4) options en cas de conflit (Ignorer / Remplacer / Créer une nouvelle version) → « Importer N variables ».
Limites : 512 Kio, 1 000 lignes utiles par fichier ; au-delà → message précis.
Chiffrement **dans le navigateur avant envoi**, par lots de 100.

### Parseur dotenv (sans perte) — exigences
- Conserve : commentaires (`# …`, commentaires en fin de ligne), lignes vides, ordre, guillemets simples/doubles/absents, séquences d'échappement, valeurs multilignes entre guillemets, préfixe `export `, espaces significatifs dans les guillemets, fin de ligne d'origine (LF/CRLF), BOM.
- Modèle interne : liste de **nœuds** (`Variable | Comment | Blank | Raw`) avec le texte source ; la structure (ordre, commentaires, blanches) est stockée chiffrée dans `env_files.enc_layout`.
- **Test de round-trip obligatoire** : `export(import(x)) === x` octet pour octet, sur un corpus de ≥ 40 fichiers incluant cas pathologiques (guillemets non fermés, `=` dans la valeur, `#` dans la valeur, unicode, emojis, CRLF mélangé).
- Aucune interpolation de variables (`${X}`) ; jamais d'évaluation.
- Bibliothèque : écrire un parseur dédié (le parseur `dotenv` standard perd commentaires/format) ; si une bibliothèque est envisagée, la rechercher, l'évaluer par le test de round-trip, documenter.

### Export
Bouton « Exporter » → choix : `.env` (fidèle), `.env.example` (valeurs vidées, noms et commentaires conservés), copie dans le presse-papiers. Confirmation d'avertissement : « Le fichier exporté contient vos valeurs en clair. » + case « Ne plus afficher » **absente** (toujours demandé). Journalisé (`env.export`), sans contenu.
Téléchargement généré **côté client** (Blob), nom `.env.<environnement>`, jamais transité par le serveur.

### Comparateur
Sheet ou page : deux sélecteurs d'environnements (A, B), tableau **Variable | A | B** avec statuts Présente / Absente / Différente / Identique (texte + icône 20 px). Filtres : « Seulement les différences ». Actions par ligne et groupées : « Ajouter à B », « Copier vers B ». **Aucune valeur affichée.** Export du rapport (noms et statuts seulement).

### États
Aucun fichier importé → EmptyState + « Importer un .env » ; import en cours (progression par lot) ; import partiel en erreur (liste des lignes ; rien n'est écrit tant que non confirmé) ; environnement en lecture seule (permission) ; coffre en rotation.
