# 07 — Design system

> **Statut des valeurs : PROVISOIRES.** Vivien fournit une image de référence. À sa réception, on extrait couleurs, polices, rayons, espacements et on **verrouille** ce fichier (§1). L'image prime sur toute valeur écrite ici. Après verrouillage, plus aucune valeur visuelle n'est modifiée sans demande explicite.

## 0. Intention

Sensation d'un produit **Vercel** (structure, sobriété, hiérarchie par le contraste et l'espace), **GitHub** (densité lisible, tableau kanban, listes d'objets), **Apple** (finition, précision des alignements, retenue). Un outil de travail calme, pas un « panneau d'admin ». Chaque élément doit pouvoir être **justifié** : s'il ne sert pas une tâche, il est supprimé.

## 1. Protocole de l'image de référence

1. Réception de l'image → l'agent liste ce qu'il y voit : palette (hex mesurés au pipette), famille et graisses de typo, rayons, épaisseur de bordures, ombres, densité, composition de la navigation.
2. Remplissage du tableau §3 avec les valeurs **mesurées**, pas estimées. Doute = on demande.
3. Écriture de `src/styles/tokens.css` (variables CSS clair + sombre si l'image en montre un) et de `tailwind` thème pointant dessus.
4. Capture de comparaison côte à côte (image vs rendu) validée par Vivien avant de construire les pages.
5. Règle : **aucune couleur ne doit exister hors `tokens.css`**. Un lint (`no-restricted-syntax` sur `#`, `rgb(`, `hsl(` dans `src/**/*.tsx`) bloque la CI.

## 2. Principes non négociables

- **Peu de texte, pas de remplissage.** Pas de phrases d'accroche, pas de « Bienvenue ! », pas de sous-titres redondants avec le titre. Les libellés d'actions sont des verbes courts (« Créer », « Partager », « Révéler »).
- **Pas de petites icônes décoratives.** Icônes : 20 px par défaut (jamais < 18 px), trait cohérent (Lucide, stroke 1.75), **toujours accompagnées d'un libellé** quand l'action n'est pas universelle. Icônes seules uniquement : fermer, menu, copier dans une ligne de valeur (avec `aria-label` et infobulle).
- **Pas d'emojis**, pas de gradients décoratifs, pas d'illustrations stock, pas de glassmorphism, pas d'ombres lourdes. Séparation par **bordures fines** et espacement.
- **Cibles tactiles ≥ 44 px** sur mobile, ≥ 36 px sur desktop. Texte ≥ 14 px pour le contenu, ≥ 12 px pour métadonnées (jamais 10–11 px).
- **Contraste WCAG AA** minimum (4,5:1 texte, 3:1 éléments UI), AAA pour les valeurs de secrets.
- **Une action primaire par écran**, visuellement évidente. Les actions destructrices sont séparées et rouges **uniquement à la confirmation** (le bouton déclencheur reste neutre).
- **Valeurs secrètes masquées par défaut**, en police monospace, largeur fixe de points (ne révèle pas la longueur).
- **Densité** : deux modes — Confortable (défaut) et Compact (lignes 32 px) — réglable dans Réglages.
- **Mouvement** : 120–180 ms, easing standard, uniquement pour feedback d'état (ouverture de panneau, glisser-déposer). Respecte `prefers-reduced-motion`. Pas d'animation d'entrée de page décorative.

## 3. Tokens (à remplir depuis l'image)

| Token | Rôle | Valeur claire | Valeur sombre | Source |
|---|---|---|---|---|
| `--bg` | Fond de l'application | PROVISOIRE `#FAFAFA` | `#000000` | image |
| `--surface` | Cartes, panneaux | `#FFFFFF` | `#0A0A0A` | image |
| `--surface-2` | Survol, zones secondaires | `#F4F4F5` | `#111111` | image |
| `--border` | Bordures fines | `#E4E4E7` | `#262626` | image |
| `--border-strong` | Bordures d'emphase | `#D4D4D8` | `#3F3F46` | image |
| `--text` | Texte principal | `#09090B` | `#EDEDED` | image |
| `--text-muted` | Texte secondaire | `#52525B` | `#A1A1AA` | image |
| `--accent` | Action primaire | `#0A0A0A` | `#FFFFFF` | image |
| `--accent-fg` | Texte sur accent | `#FFFFFF` | `#000000` | image |
| `--focus` | Anneau de focus | `#2563EB` | `#60A5FA` | image |
| `--success` | Succès | `#15803D` | `#4ADE80` | image |
| `--warning` | Avertissement | `#B45309` | `#FBBF24` | image |
| `--danger` | Destructif | `#B91C1C` | `#F87171` | image |
| `--danger-bg` | Fond d'alerte destructive | `#FEF2F2` | `#1F0A0A` | image |
| `--secret-bg` | Fond d'une valeur masquée | `#F4F4F5` | `#111111` | image |
| `--radius-sm/md/lg` | Rayons | 6 / 8 / 12 px | idem | image |
| `--font-sans` | Interface | Geist Sans | idem | image |
| `--font-mono` | Valeurs, clés | Geist Mono | idem | image |

Échelle typographique : 12 / 14 / 16 / 20 / 24 / 32 px ; interligne 1,5 (texte) / 1,25 (titres) ; graisses 400, 500, 600 seulement.
Échelle d'espacement : 4, 8, 12, 16, 24, 32, 48, 64. Aucun espacement hors échelle.
Largeurs : contenu principal max 1200 px ; formulaires max 560 px ; panneau latéral 420 px ; sidebar 256 px (64 px repliée).
Z-index : base 0, sticky 10, dropdown 20, modale 30, toast 40, palette de commandes 50.
Thèmes : clair, sombre, système (défaut). Pas de flash au chargement (script de thème inline avec nonce).

## 4. Composants (chacun : fichier ≤ 120 lignes, tous les états)

États communs pour tout composant interactif : repos, survol, focus visible, actif, désactivé (avec raison accessible), chargement, erreur.

- **Button** : primaire (accent), secondaire (bordure), ghost, destructif (confirmation seulement). Tailles 36 / 40 / 44. Chargement = spinner **dans** le bouton sans changer sa largeur.
- **Input / Textarea / Select / Combobox** : label **toujours visible** au-dessus (pas de placeholder-label), aide et erreur sous le champ, `aria-describedby`.
- **SecretValue** : masqué par défaut ; actions « Révéler » (maintenu ou bascule), « Copier » ; remasquage auto 10 s ; décompte discret ; police mono ; sélection désactivée tant que masqué.
- **Badge** : catégorie, rôle, statut. Texte, pas de couleur seule.
- **Sidebar** : liens avec libellés (icône 20 px + texte), section active par fond `--surface-2` + barre fine, repliable.
- **Topbar** : fil d'Ariane (3 niveaux max), bouton recherche `⌘K` avec libellé, menu compte.
- **CommandPalette** : champ, résultats groupés (Coffres, Projets, Secrets, Actions), flèches + Entrée, aucun résultat = message + suggestion d'action.
- **DataTable** : en-têtes collants, tri, sélection multiple, actions de ligne au survol **et** au focus clavier, virtualisation > 100 lignes, vue vide dédiée.
- **KanbanBoard / Column / Card** : voir 09 (projets).
- **Dialog / Sheet** : focus piégé, Échap ferme (sauf saisie non sauvegardée → confirmation), titre obligatoire, une action primaire.
- **ConfirmDestructive** : saisie du nom de l'objet pour confirmer les suppressions de coffre/projet/compte.
- **Toast** : succès bref (4 s), erreur persistante avec action de reprise ; jamais de valeur secrète dedans.
- **EmptyState** : 1 titre, 1 phrase max, 1 action. Pas d'illustration.
- **Skeleton** : mêmes dimensions que le contenu final (zéro saut de mise en page).
- **FingerprintBadge** : empreinte de clé en 4 groupes mono, bouton copier.
- **PermissionMatrix** : cases cochables par permission, rôle prédéfini en haut, ligne d'exception visible.
- **Stepper** (onboarding) : 3 étapes, étape courante en gras, pas de barre de progression décorative.

## 5. États d'écran obligatoires (chaque page)

1. **Chargement** (skeleton). 2. **Vide** (EmptyState). 3. **Données**. 4. **Erreur** (message générique + « Réessayer »). 5. **Non autorisé / introuvable**. 6. **Verrouillé** (redirige vers `/unlock`). 7. **Hors ligne** (bandeau, lecture seule). 8. **Chargement partiel** (liste affichée, ajout en cours).

## 6. Textes (voix de l'interface)

- Français, tutoiement évité : forme **neutre/impérative** (« Créer un coffre », « Aucun secret »).
- Titres de page : un nom (« Coffres »), pas une phrase.
- Pas de ponctuation exclamative. Pas de jargon crypto dans l'UI courante ; le détail technique vit dans « En savoir plus » (lien, pas bloc de texte).
- Messages d'erreur : ce qui s'est passé + quoi faire, en une phrase.
- Avertissements de sécurité : **uniquement** là où une décision irréversible existe (clé de récupération, révocation, suppression, partage).
- Dates relatives ≤ 7 jours (« il y a 2 h »), absolues au-delà, `title` avec la date complète.
- Chaque chaîne dans `messages/fr.json` (i18n prête pour `en` plus tard), jamais en dur dans les composants.

## 7. Accessibilité

Navigation clavier complète (ordre logique, pas de piège), focus toujours visible (`--focus`, 2 px, offset 2 px), rôles ARIA corrects (dialog, menu, combobox, tablist), annonces `aria-live` pour copie/révélation/erreurs, glisser-déposer du kanban **avec alternative clavier** (menu « Déplacer vers… »), zoom 200 % sans perte, `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast`.

## 8. Responsive

Points de rupture : 640, 768, 1024, 1280. Mobile : barre d'onglets inférieure (Accueil, Coffres, Secrets, Partages, Plus), recherche en plein écran, tables → listes de cartes, panneaux latéraux → feuilles plein écran. Le kanban défile horizontalement avec accroche (snap) par colonne.

## 9. Interdits visuels (liste de rejet en revue de code)

Valeur de couleur en dur · police hors tokens · icône < 18 px · icône sans libellé pour une action non évidente · ombre portée > 1 niveau · dégradé · emoji · texte de remplissage · carte dans une carte dans une carte · plus de 2 boutons pleins par écran · modale sur modale · placeholder utilisé comme label · animation > 200 ms · couleur seule pour porter un sens · valeur secrète affichée par défaut · bouton rouge plein hors confirmation.
