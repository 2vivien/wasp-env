# 11 — Pages partage, groupes, activité, réglages

---

## P15 — Dialogue « Partager » (secret, projet, coffre)

**Déclencheur** : bouton « Partager » sur l'objet. **Sheet 480 px**, titre « Partager “<nom>” ».
**Structure** : 3 onglets texte — **Par pseudo** · **Lien privé** · **QR code**. En dessous : liste « Ont accès » (avatars, `@pseudo`, rôle, expiration éventuelle, « Modifier », « Retirer »).

### Par pseudo
Champ de recherche `@pseudo` (debounce 300 ms, 20 résultats max) → carte résultat : avatar, `@pseudo`, nom d'affichage, **empreinte de clé** courte. Sélection → choix du **rôle** (Lecteur, Utilisateur, Éditeur, Administrateur) et de l'**expiration** (jamais, 1 h, 24 h, 7 j, 30 j, date). Lien « Permissions détaillées » → PermissionMatrix (8 permissions). Option « Afficher/masquer la copie » avec la mention « restriction d'interface ». Bouton « Inviter ».
Groupes : onglet interne « Groupe » pour inviter un groupe entier (chaque membre reçoit sa propre enveloppe).
Si destinataire déjà membre → message « Déjà membre » + lien vers sa ligne.

### Lien privé
Options : expiration (5 min → 30 j, défaut 1 h), nombre d'usages (1–100, défaut 1), code d'accès facultatif (≥ 6 caractères, généré possible), permissions (consultation / consultation + copie), cible (secret seul pour les liens ; **les projets/coffres passent par invitation nominative**, les liens ne donnent accès qu'à un secret ou un petit lot — décision à confirmer dans DECISIONS.md).
Bouton « Créer le lien » → le lien s'affiche **une seule fois** avec « Copier », avertissement : « Quiconque possède ce lien peut accéder au secret jusqu'à son expiration. » Liste « Liens actifs » : statut, usages (n / max), expiration, « Révoquer ».

### QR code
Génère le **même lien privé** (mêmes options) sous forme de QR code (généré côté client, taille 256 px, haute correction d'erreur), bouton « Télécharger l'image ». Avertissement identique. Pas de QR contenant autre chose que l'URL.

### Étape de confirmation avant partage d'un coffre ou d'un projet
Récapitulatif : « `@pseudo` pourra : voir, révéler, copier… dans <portée> ». Pour un projet/coffre : « N secrets seront accessibles. » Bouton « Confirmer le partage ».

### États / erreurs
Pseudo introuvable ; permission `share` manquante (bouton masqué) ; limite de membres (100) ; limite de liens (100) ; échec de scellement de clé (« Impossible de chiffrer pour cet utilisateur ») ; coffre en rotation (partage suspendu).

---

## P16 — Partagés avec moi `/shared`

**But** : voir tout ce que d'autres ont partagé.
**Mise en page** : onglets Coffres · Projets · Secrets ; liste en lignes : nom, propriétaire (`@pseudo`), votre rôle, permissions résumées (badges), expire le, ajouté le.
**Actions** : Ouvrir, Quitter le partage (confirmation), voir mes permissions.
**États** : vide → « Rien n'est partagé avec vous. » ; accès expiré → ligne grisée « Expiré » + suppression ; accès révoqué → disparaît à l'actualisation, toast si ouvert.

---

## P17 — Mes partages `/sharing`

**But** : auditer ce que j'ai partagé.
**Onglets** : Personnes · Liens · Groupes.
- **Personnes** : tableau (objet, `@pseudo`, rôle, depuis, expire) + actions « Modifier les permissions », « Retirer ».
- **Liens** : statut (Actif, Expiré, Révoqué, Épuisé), usages, expiration, « Voir l'historique d'usage » (dates, empreintes d'appareil tronquées), « Révoquer ».
- **Groupes** : accès accordés via groupes.
**Filtres** : objet, personne, statut. **Action groupée** : « Tout révoquer pour cette personne » (confirmation + information sur la rotation).
**Cas limites** : retirer l'accès à un coffre déclenche la rotation (dialogue explicatif) ; à un secret seul : régénération de la clé de partage.

---

## P18 — Invitations `/invitations`

**Onglets** : Reçues · Envoyées.
**Reçues** : ligne = `@pseudo` expéditeur, objet, rôle proposé, expire dans, boutons « Accepter » / « Refuser ». Accepter ouvre un récapitulatif (permissions, empreinte de l'expéditeur) puis déchiffre l'enveloppe de clé localement.
**Envoyées** : statut (En attente, Acceptée, Refusée, Révoquée, Expirée), « Révoquer » si en attente.
**Pastille** dans la sidebar tant qu'il reste des reçues en attente. Pas d'e-mail envoyé : la découverte se fait à la prochaine connexion/rafraîchissement (polling doux 60 s à l'ouverture de l'app, pas de WebSocket au MVP).
**États** : vide → « Aucune invitation. » ; invitation expirée → bouton « Demander à nouveau » désactivé (info seulement).

---

## P19 — Groupes `/groups`

**But** : regrouper des personnes pour partager plus vite.
**Liste** : nom (chiffré), nb de membres, modifié. Bouton « Nouveau groupe ».
**Détail** : nom, membres (ajout par `@pseudo`, retrait), accès accordés au groupe (liste d'objets). Renommer, supprimer (supprimer un groupe retire les accès **accordés via ce groupe**, avec récapitulatif avant confirmation).
**Limites** : 50 groupes, 100 membres chacun.
**Cas limites** : un membre retiré d'un groupe → rotation si coffre concerné ; personne présente à la fois en accès direct et via groupe → on garde l'union des permissions, affichée explicitement.

---

## P20 — Activité `/activity`

**But** : savoir ce qui s'est passé.
**Mise en page** : filtres (Coffre, Projet, Événement, Personne, Période) + journal en lignes : date/heure, acteur (`@pseudo`), événement lisible (« a modifié <nom> »), cible, détails repliables (rôle, permissions, nombre).
**Événements** : création, modification, suppression, restauration, export ENV, création de partage, acceptation, refus, révocation, changement de permission, rotation de clé, consultation (si observable), connexion, nouvelle session, récupération utilisée, échecs de lien.
**Règles** : **jamais** de valeur/clé/fragment ; les noms d'objets sont déchiffrés côté client à l'affichage ; export du journal en CSV (sans valeurs).
**Pagination** par curseur, 50 par page, chargement infini avec bouton « Charger plus » (accessible).
**États** : vide → « Aucune activité. » ; filtre sans résultat.
**Cas limites** : événements d'un utilisateur supprimé affichés « Compte supprimé ».

---

## P21 — Réglages `/settings`

**Navigation latérale interne** : Compte · Sécurité · Apparence · Données.

### Compte
Pseudo (modifiable 1 fois / 30 j, avec rappel de la réservation de l'ancien), nom d'affichage, avatar (envoi ≤ 2 Mo, recadrage carré, **pas d'avatar Google par défaut**), bio, **e-mail Google en lecture seule** avec mention « Visible par vous seul ». Bouton « Supprimer le compte » (zone dangereuse, confirmation en saisissant le pseudo).

### Sécurité `/settings/security`
- **Phrase secrète** : « Changer la phrase » (ancienne ou clé de récupération → nouvelle).
- **Clé de récupération** : « Régénérer » (affichée une fois, confirmation), date de dernière génération.
- **Verrouillage automatique** : curseur 1–120 min (défaut 15), option « Verrouiller à la fermeture de l'onglet » (défaut oui), « Remasquer les valeurs à la perte de focus ».
- **Presse-papiers** : effacement après 10–120 s ou désactivé (défaut 30 s).
- **Délai de révélation** : 5–60 s (défaut 10).
- **Sessions actives** : liste, « Déconnecter » par ligne, « Déconnecter tous les autres appareils ».
- **Alertes** : changement de clé publique d'un contact, utilisation de la récupération.

### Apparence
Thème (Clair / Sombre / Système), densité (Confortable / Compact), barre latérale repliée par défaut, langue (Français, prêt pour Anglais).

### Données
« Exporter une sauvegarde chiffrée » (saisie d'une phrase d'export, génération côté client, téléchargement `.json`), « Importer une sauvegarde », corbeille (restaurer/supprimer définitivement, rétention 30 j).

**États** : enregistrement par section avec confirmation (« Enregistré ») ; erreurs champ par champ ; opérations sensibles redemandent la phrase secrète (changement de phrase, régénération de clé, suppression de compte, export).

---

## P22 — Pages système

- **404** : « Page introuvable. » + « Retour à la vue générale ». Ne distingue jamais « n'existe pas » de « pas autorisé ».
- **Erreur** (`error.tsx`) : « Une erreur est survenue. » + « Réessayer » + identifiant de requête copiable.
- **Maintenance / hors ligne** : bandeau persistant, lecture des données déjà déchiffrées en mémoire, écritures désactivées.
- **Navigateur non pris en charge** : liste des prérequis (WebCrypto, WebAssembly, `crypto.subtle`).
- **Aide des raccourcis** (`?`) : modale en deux colonnes.
