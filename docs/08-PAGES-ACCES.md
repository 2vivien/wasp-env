# 08 — Pages d'accès : landing, connexion, onboarding, déverrouillage

Format de chaque page : **Route · But · Mise en page · Contenu · Actions · États · Données/hooks · Cas limites.** Les couleurs, rayons, polices viennent de `07` ; aucun style en dur.

---

## P1 — Landing `/`

**But** : faire comprendre le produit et amener au clic « Continuer avec Google ».
**Mise en page** : en-tête fixe (logo à gauche, lien « Code source », bouton « Se connecter »). Hero centré, largeur 720 px max. Pas de carrousel.
**Contenu (minimal)** :
1. Titre : « Vos secrets. Un seul endroit sûr. » (version finale validée avec l'image).
2. Une ligne : « Coffre chiffré dans le navigateur, partage sans e-mail. »
3. Bouton primaire « Continuer avec Google » (logo Google 20 px) + lien secondaire « Voir le code ».
4. Une **vraie capture** du produit (fidèle au design final), pas une illustration.
5. Trois blocs sobres : « Chiffré avant l'envoi », « Partagez par @pseudo, lien ou QR », « Importez vos .env ». Un titre + une phrase chacun.
6. Pied de page : Code source, Documentation, Sécurité (modèle de menace), Confidentialité. Rien d'autre.
**États** : utilisateur déjà connecté → bouton devient « Ouvrir » vers `/dashboard`. JS désactivé → message minimal.
**Données** : statique (Server Component), aucune requête. Métadonnées SEO + Open Graph.
**Interdits** : compteurs fictifs, témoignages, logos clients, animations décoratives.

---

## P2 — Connexion `/login`

**But** : se connecter avec Google, rien d'autre.
**Mise en page** : carte centrée 400 px, logo, un bouton.
**Contenu** : titre « Connexion », bouton « Continuer avec Google », une ligne « Google confirme votre identité. Il ne déverrouille jamais vos secrets. » (lien « En savoir plus » → explication du modèle).
**Actions** : clic → `signIn.social({ provider: 'google', callbackURL })`. Le bouton passe en chargement et se désactive (anti double clic).
**États** : normal · chargement · erreur (`?error=`) : « Connexion impossible. Réessayez. » · annulé : « Connexion annulée. » · e-mail non vérifié : « Ce compte Google n'est pas vérifié. »
**Cas limites** : déjà connecté → redirection selon l'étape (onboarding / unlock / dashboard) ; `callbackURL` validé (chemin interne uniquement, pas d'open redirect).
**Interdits** : champ e-mail, champ mot de passe, « Mot de passe oublié », autre fournisseur.

---

## P3 — Onboarding `/onboarding` (3 étapes, reprenable)

Stepper en haut : 1 Pseudo · 2 Phrase secrète · 3 Récupération. L'étape est lue depuis `profiles.onboarding_step`.

### Étape 1 — Pseudo
**Champ** : `@` fixe + saisie, validation à la frappe (debounce 300 ms) : « Disponible » / « Déjà pris » / « Format invalide » (règles listées en dessous du champ). **Bouton** : « Continuer ».
**Texte d'aide (1 ligne)** : « Les autres vous trouvent avec ce pseudo. Votre e-mail reste privé. »

### Étape 2 — Phrase secrète
**Champs** : phrase, confirmation, bascule afficher/masquer. Jauge de force (texte : Faible / Correcte / Forte, pas seulement une couleur).
**Bandeau d'avertissement (le seul de l'étape)** : « Cette phrase ne peut pas être récupérée. Elle n'est jamais envoyée à nos serveurs. »
**Bouton** : « Créer la phrase » (désactivé tant que < min et non identique). Pendant la dérivation Argon2id (~1 s) : bouton en chargement + libellé « Dérivation de la clé… ».
**Cas limites** : collage autorisé ; gestionnaire de mots de passe compatible (`autocomplete="new-password"`) ; échec WASM → message d'incompatibilité.

### Étape 3 — Clé de récupération
**Affichage** : clé en groupes mono (ex. `XXXX-XXXX-…`), boutons « Copier », « Télécharger (.txt) », « Imprimer ».
**Avertissement** : « Sans votre phrase ni cette clé, vos données sont perdues définitivement. »
**Confirmation** : l'utilisateur ressaisit **3 groupes demandés au hasard** ; bouton « Terminer » actif seulement ensuite. La clé n'est plus jamais réaffichée (régénération possible dans Réglages).
**Fin** : création transactionnelle côté serveur (06 `POST /me/keys`) → `/dashboard`.
**Cas limites** : fermeture d'onglet avant fin → au retour, étape 2 refaite (la clé de récupération non confirmée est jetée) ; erreur serveur → conserve l'état local en mémoire et propose « Réessayer ».

**Navigation** : pas de retour vers `/dashboard` tant que non terminé ; bouton « Se déconnecter » discret en haut à droite.

---

## P4 — Déverrouillage `/unlock`

**But** : rouvrir le coffre quand l'utilisateur est connecté mais verrouillé.
**Mise en page** : carte centrée 420 px ; en haut : avatar + `@pseudo` (identité de la session).
**Contenu** : champ « Phrase secrète » (autofocus), bouton « Déverrouiller », lien « Utiliser la clé de récupération », lien « Changer de compte » (déconnexion).
**Comportement** :
- Entrée valide le formulaire ; échec → « Phrase incorrecte. » + délai croissant (1 s, 2 s, 4 s… max 30 s) avec décompte affiché ; bouton désactivé pendant le délai.
- Après 5 échecs : suggestion visible de la clé de récupération.
- Succès → retour à l'URL demandée (`?next=` interne validé) sinon `/dashboard`.
**Mode récupération** : champ clé de récupération → déverrouille → **oblige** à définir une nouvelle phrase puis propose de régénérer la clé de récupération.
**États** : normal · dérivation en cours · échec · bloqué (décompte) · erreur technique · session expirée (redirige vers `/login`).
**Sécurité** : le champ n'est jamais pré-rempli ; pas de « Se souvenir de la phrase ».

---

## P5 — Ouverture d'un lien privé `/l/[token]`

**But** : un destinataire (connecté ou non) ouvre un secret partagé.
**Contenu** : état d'abord neutre « Ouverture du lien sécurisé… ». Le fragment `#clé` est lu côté client puis effacé de l'URL.
**Cas** :
- Lien valide sans code : affiche l'objet partagé (nom, valeur masquée, bouton Révéler/Copier selon permissions) et l'expiration (« Expire dans 1 h 20 »).
- Code requis : champ « Code d'accès », 5 essais puis blocage.
- Expiré / révoqué / épuisé : « Ce lien n'est plus valide. » (même message pour les trois, pas de fuite d'info).
- Fragment absent ou corrompu : « Lien incomplet. Demandez-en un nouveau. »
- Pour **conserver** le partage (projet/coffre) : « Se connecter pour enregistrer » → login Google → acceptation.
**Interdits** : analytics, scripts tiers, referrer. Page `noindex`.
