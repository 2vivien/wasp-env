# 09 — Pages de l'espace : layout, dashboard, coffres, projets (kanban)

Rappel : valeurs visuelles = tokens de `07`. États obligatoires : chargement, vide, données, erreur, non autorisé, verrouillé, hors ligne.

---

## L0 — Layout de l'application `(app)/layout.tsx`

**Desktop (≥ 1024 px)** : sidebar fixe 256 px (repliable à 64 px, préférence mémorisée) + zone principale. Topbar 56 px sticky dans la zone principale.
**Sidebar (de haut en bas)** :
1. Sélecteur de coffre actif (nom + icône, menu : tous les coffres, « Nouveau coffre »).
2. Recherche `⌘K` (champ factice qui ouvre la palette).
3. Espace : Vue générale · Coffres · Projets · Tous les secrets · Variables ENV · Favoris.
4. Collaboration : Partagés avec moi · Mes partages · Invitations (pastille de compte si > 0) · Groupes.
5. Activité · Réglages.
6. Bas : état du coffre (« Déverrouillé · verrouillage dans 12 min »), bouton **Verrouiller**, avatar + `@pseudo` + menu (Réglages, Se déconnecter).
**Topbar** : fil d'Ariane (Coffre › Projet › Environnement), action primaire contextuelle à droite (ex. « Nouveau secret »).
**Mobile** : barre inférieure 5 entrées (Accueil, Coffres, Secrets, Partages, Plus) ; le reste dans « Plus » ; recherche = icône 24 px + libellé dans la topbar.
**Raccourcis** : `⌘/Ctrl+K` recherche, `⌘/Ctrl+L` verrouiller, `G` puis `D/V/P/S` navigation, `N` nouvel objet contextuel, `?` aide des raccourcis. Désactivés dans les champs de saisie.
**Garde** : si non connecté → `/login` ; profil incomplet → `/onboarding` ; verrouillé → `/unlock?next=…`.

---

## P6 — Vue générale `/dashboard`

**But** : reprendre le travail en 2 secondes.
**Mise en page** : grille 12 colonnes ; trois zones.
1. **Accès rapides** (ligne de 4 actions larges, 44 px, avec libellé) : « Nouveau secret », « Importer un .env », « Nouveau projet », « Partager ».
2. **Récents** (liste GitHub-like, 8 lignes) : nom du secret/projet, chemin (Coffre › Projet › Env), date relative. Clic ouvre l'objet. **Pas** de valeurs.
3. **Activité récente** (6 événements, lien « Tout voir ») + **À traiter** (invitations en attente, rotations en cours, secrets proches d'une expiration définie par l'utilisateur).
**Pas de** : graphiques décoratifs, compteurs sans action, texte de bienvenue.
**Chiffres** : une ligne discrète « 4 coffres · 8 projets · 56 secrets » en tête, calculée côté client (les noms sont chiffrés, les comptes non).
**États** : vide complet (nouveau compte) → trois étapes concrètes en liste : « Créer un projet », « Importer un .env », « Inviter quelqu'un », chacune avec un bouton. Erreur partielle : chaque zone gère son erreur indépendamment.
**Hooks** : `useRecentItems`, `useActivity({limit:6})`, `useInvitations({status:'pending'})`.

---

## P7 — Liste des coffres `/vaults`

**But** : voir et gérer ses coffres.
**Mise en page** : en-tête (titre « Coffres », bouton primaire « Nouveau coffre »), filtres en onglets texte : Tous · Personnel · Partagés · Archivés. Liste en **lignes** (pas de grosses cartes) : icône 24 px couleur du coffre, nom, description 1 ligne, badge Personnel/Partagé, nombre de membres, nombre de projets/secrets, dernière modification.
**Actions de ligne** : Ouvrir (clic), Renommer, Archiver, Quitter (si partagé et non propriétaire), Supprimer (propriétaire) — dans un menu « Actions » libellé.
**Création (Sheet)** : nom (requis, ≤ 60), description (≤ 200), icône, couleur, type (Personnel / Partagé). Bouton « Créer ».
**États** : vide → « Aucun coffre. » + « Nouveau coffre » ; archivés vides ; erreur.
**Cas limites** : max 50 coffres possédés (message au 50ᵉ) ; coffre personnel par défaut non supprimable ; suppression = corbeille 30 j avec ConfirmDestructive (saisie du nom).

---

## P8 — Détail d'un coffre `/vaults/[vaultId]`

**En-tête** : nom, badge, description, boutons « Nouveau projet », « Nouveau secret », « Partager le coffre », menu « Plus » (Renommer, Archiver, Transférer la propriété, Rotation des clés, Supprimer).
**Onglets (texte)** : Projets · Secrets · Membres · Activité · Réglages.
- **Projets** : grille de cartes de projet (3 colonnes desktop) — nom, tags (max 3), environnements en pastilles texte (Dev · Staging · Prod), nb de secrets, dernière modification. Carte entière cliquable.
- **Secrets** : secrets directs du coffre (DataTable, voir P12).
- **Membres** : tableau (avatar, `@pseudo`, rôle, ajouté le, actions). Bouton « Inviter ». Rôle modifiable par menu ; exceptions via PermissionMatrix en Sheet. Retirer un membre → ConfirmDestructive expliquant la **rotation** et ses limites ; état `rotating` visible avec progression (« 42 / 120 secrets rechiffrés »).
- **Activité** : journal filtré sur ce coffre.
- **Réglages** : nom, description, icône, couleur, politique de verrouillage du coffre (copie autorisée oui/non — rappelé comme restriction d'interface), zone dangereuse en bas (Archiver, Supprimer).
**Cas limites** : coffre en rotation → écritures désactivées avec message ; membre sans permission `manage` → onglets Membres/Réglages en lecture seule ou masqués ; coffre archivé → bandeau « Archivé » + bouton « Restaurer ».

---

## P9 — Liste des projets `/projects`

**But** : tous les projets, tous coffres confondus.
**Mise en page** : titre, bouton « Nouveau projet », filtres (Coffre, Tag, Archivés) + recherche locale. Tableau : nom, coffre, environnements, nb de secrets, modifié. Tri par colonne.
**Création (Sheet)** : coffre (sélecteur), nom (≤ 60), description (≤ 200), icône, tags, environnements à créer (cases : Development ✓, Staging, Production ✓, + « Ajouter »).
**États** : vide → « Aucun projet. » + « Nouveau projet ».

---

## P10 — Projet en tableau kanban `/projects/[projectId]`  ← écran signature

**Principe** : le **tableau de projet de GitHub**, appliqué aux environnements. **Colonnes = environnements** (Development, Staging, Production, …). **Cartes = secrets/variables** de l'environnement. Le kanban n'est pas décoratif : il sert à **voir ce qui manque entre environnements** et à **copier/déplacer** une variable d'un environnement à l'autre.

**En-tête** : nom du projet, coffre, tags, boutons « Nouveau secret », « Importer .env », « Comparer », « Partager le projet », menu « Plus ». Barre d'outils : recherche, filtre catégorie, bascule de vue **Tableau | Liste**.

**Colonne** (largeur 320 px, hauteur pleine, défilement interne) :
- En-tête : nom de l'environnement, compteur (« 12 »), menu (Renommer, Dupliquer, Exporter .env, Importer, Supprimer).
- Corps : cartes. Pied : bouton « Ajouter un secret » plein largeur (comme GitHub).
- Colonne « + Environnement » en fin de rang (max 10).

**Carte** (hauteur 56–72 px, bordure fine, pas d'ombre) :
- Ligne 1 : nom (`OPENAI_API_KEY`, mono, tronqué avec infobulle) + badge de catégorie (texte).
- Ligne 2 : valeur masquée `••••••••` + actions **au survol et au focus** : « Révéler », « Copier ». Sur mobile : toujours visibles.
- Indicateur **d'absence** : si la variable existe dans un autre environnement mais pas ici, une carte « fantôme » en pointillé (« Absente » + bouton « Ajouter ») apparaît **uniquement en mode Comparer**.
- Clic sur la carte → panneau latéral (Sheet 420 px) = fiche du secret (P13).

**Glisser-déposer** :
- Glisser une carte vers une autre colonne = **Copier** (par défaut) ; touche `Alt`/`Option` ou menu = Déplacer. Un petit sélecteur à la dépose propose « Copier » / « Déplacer ».
- Réordonner dans une colonne (position).
- **Alternative clavier** : carte focalisée → menu « Déplacer vers… / Copier vers… » (touche `M`). Annonces `aria-live`.
- Écrire/rechiffrer ne se fait qu'**après** déverrouillage ; sinon dépôt refusé avec toast.

**Mode Comparer** : choisir deux environnements (sélecteurs en haut). Les cartes se mettent en regard par nom ; chaque ligne affiche **Présente / Absente / Différente / Identique** pour A et B, **jamais les valeurs**. Actions : « Ajouter à B », « Copier la valeur vers B » (confirmation), « Ignorer ».

**Vue Liste** : DataTable (nom, catégorie, environnement, modifié, actions) pour grands projets (> 100 variables ou mobile).

**États** : projet vide → « Aucun environnement. » + « Ajouter un environnement » ; colonne vide → « Aucun secret. » + « Ajouter » ; chargement → squelettes de colonnes ; erreur de colonne isolée (autres colonnes intactes) ; coffre en rotation → lecture seule.
**Performance** : virtualisation par colonne au-delà de 50 cartes ; déchiffrement des noms en lot (Web Worker) ; pas de déchiffrement de valeurs tant qu'on ne révèle pas.
**Hooks** : `useProject`, `useEnvironmentBoard`, `useEnvDiff`, `useMoveSecret`, `useBoardDnd`.
**Fichiers** (plafonds de 02) : `ProjectBoard.tsx`, `BoardColumn.tsx`, `SecretCard.tsx`, `GhostCard.tsx`, `BoardToolbar.tsx`, `CompareBar.tsx`, `use-board-dnd.ts`, etc. — **aucun composant > 150 lignes**.
**Bibliothèque DnD** : `@dnd-kit/core` + `@dnd-kit/sortable` (accessible clavier). Vérifier la version et la compatibilité React 19 avant installation (règle de recherche).
