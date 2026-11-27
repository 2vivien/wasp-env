# Revue de sécurité interne — Wasp

Ce document est une **revue interne**, pas un audit indépendant. Il ne remplace pas l'audit externe exigé avant ouverture publique (feuille de route, phase 7). Il liste les contrôles vérifiables automatiquement dans ce dépôt et leurs limites.

## Contrôles vérifiés en CI

| Contrôle                             | Preuve                                                                    | Résultat                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Dépendances sans vulnérabilité haute | `pnpm audit --audit-level high`                                           | vert                                                                       |
| Aucun secret versionné               | `gitleaks` sur chaque commit                                              | vert (3 valeurs factices explicitement allowlistées dans `.gitleaks.toml`) |
| Typecheck strict et lint             | `pnpm lint`, `pnpm typecheck`                                             | verts                                                                      |
| Non-fuite des journaux               | fuzz de 1 000 opérations dans `lib/logger.test.ts`                        | vert ; a conduit à compléter la liste de rédaction pino                    |
| Authentification des endpoints       | `tests/api-auth.test.ts` : toute route métier appelle `getCurrentSession` | vert                                                                       |
| Autorisation des mutations           | `tests/api-auth.test.ts` : ownership strict ou `can()` avec exceptions    | vert                                                                       |
| Isolation des objets d'autrui        | `tests/idor.test.ts` sur base PostgreSQL de test (401/404/403/conflict)   | vert                                                                       |
| Rotation de projet après révocation  | `tests/project-rotation.test.ts` (job pending → completed)                | vert                                                                       |
| E-mail Google vérifié                | `lib/auth/verification.ts` + `lib/auth/session.ts`                        | vert                                                                       |
| Chiffrement avant stockage           | vecteurs `src/crypto/*.test.ts`, couverture 95 % en lignes                | vert                                                                       |
| Accessibilité                        | axe WCAG A/AA sur états publics et pages authentifiées (20 E2E)           | vert                                                                       |

## Limites explicitement non couvertes

- **Audit externe indépendant** : aucun contrôle automatique ne peut le remplacer, en particulier sur la hiérarchie de clés, les enveloppes et le modèle de menace.
- **RLS PostgreSQL** : la décision du 26/11 reste en vigueur (filtrage applicatif strict, pool pg sans identité par transaction). Les tests IDOR couvrent le comportement actuel, pas une défense en profondeur au niveau base.
- **XSS, extension malveillante, appareil compromis, presse-papiers** : hors périmètre technique du zero-knowledge ; documentés dans `THREAT_MODEL.md`.
- **Rate limiting distribué** : Redis/Upstash requis en production ; la CI ne teste pas le comportement sous charge.
- **Restauration Neon** : non exécutée en CI ; nécessite un environnement de production contrôlé.

## Conclusion

Les contrôles automatisés sont verts. Ils constituent un filet de sécurité, pas une certification. La mise en production publique reste conditionnée à l'audit externe et à une restauration testée, comme indiqué dans `SECURITY.md` et `THREAT_MODEL.md`.
