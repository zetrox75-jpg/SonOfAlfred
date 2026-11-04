# AION 2 Craft Profit Manager

> Application Windows de gestion, d'analyse et d'optimisation de la
> rentabilité du craft pour **AION 2 Global**.

Ce dépôt doit contenir une véritable application utilisable, et non une
simple maquette. Le logiciel doit permettre de consulter un catalogue de
recettes vérifiées, saisir ou importer des prix de marché, calculer les
chaînes de fabrication complètes et identifier les crafts les plus
rentables.

------------------------------------------------------------------------

## 1. Mission de Claude Code

Tu es l'ingénieur logiciel principal de ce projet. Tu dois construire,
tester et documenter l'application de bout en bout.

### Règles impératives (relaxed by the user on 2026-10-31 — this wording overrides the earlier stricter one)

1.  **Never claim a feature exists if it is not actually implemented and tested.**
2.  **Never invent recipes, quantities, statistics, taxes, probabilities or AION 2 Global market data.** Data integrity stays strict; the rules below are relaxed so the project can move forward.
3.  Every data record keeps its provenance and status: `verified`, `community` or `user_provided`. **Community data is usable by default and simply shown with its label**; a user-controlled filter can exclude it from an analysis, but exclusion is no longer the default.
4.  Provider fields whose exact semantics are not documented (for example `units_sold` and `sold_avg_price` from aion2.exchange) **may be stored** with a `community`/`unknown` label and a note describing what is known. Do not drop them by default, and never present them as confirmed sale prices.
5.  Never present an old manual price as a current price. Always show its source and last-updated date.
6.  Do not defeat a site's technical protections (logins, bot walls, paywalls) and never touch private/internal game endpoints, game-client modification or account credentials. **Public, keyless, read-only community APIs — such as aion2.exchange — are explicitly allowed.** Identify the app honestly in its User-Agent, respect rate limits and server-side caching, attribute the source, and record it in `docs/DATA_SOURCES.md`. The absence of written terms of service does not by itself forbid using a public read-only API: document what is known and unknown instead of blocking on it.
7.  Do not block development waiting for a complete catalogue: build with clearly fictional demo data, isolated and labelled, then import real data.
8.  Inspect the repository and preserve existing work before major changes.
9.  Work in functional steps, run the tests and fix errors before declaring a step finished.
10. If a needed piece of information is unknown, document the assumption or ask; do not turn it into a fact.

------------------------------------------------------------------------

## 2. Objectifs produit

L'utilisateur doit pouvoir :

-   rechercher un objet ou une recette dans un catalogue ;
-   consulter les ingrédients et les quantités d'une recette ;
-   saisir le prix d'achat et le prix de vente de chaque objet ;
-   calculer le coût complet d'un craft, y compris les composants
    intermédiaires ;
-   comparer l'achat d'un composant à sa fabrication ;
-   déduire les ressources déjà présentes dans son inventaire ;
-   simuler la fabrication de plusieurs unités ;
-   comparer et classer les recettes selon leur rentabilité ;
-   consulter l'historique des prix ;
-   importer et exporter ses données ;
-   utiliser les fonctions locales hors ligne.

**Cible :** AION 2 Global. Les données KR ou TW ne doivent jamais être
présentées comme des données Global confirmées. Elles peuvent être
importées dans un espace séparé et clairement étiqueté si l'utilisateur
le demande.

------------------------------------------------------------------------

## 3. Plateforme et stack technique

Construis une application de bureau Windows avec :

-   **Tauri 2** pour l'application desktop ;
-   **React + TypeScript** pour l'interface ;
-   **Vite** pour le build frontend ;
-   **Tailwind CSS** pour le style ;
-   **SQLite** pour la persistance locale ;
-   **Recharts** pour les graphiques ;
-   un validateur de schémas TypeScript (Zod ou équivalent) pour les
    imports et les entrées ;
-   un framework de tests adapté au frontend et au moteur métier
    (Vitest, par exemple).

Utilise les versions stables et compatibles au moment du développement.
Vérifie les instructions officielles Tauri 2 pour la configuration
Windows. N'ajoute pas de dépendances sans raison.

Privilégie les calculs métier dans des modules TypeScript indépendants
de l'interface, afin qu'ils soient faciles à tester.

### Principes d'architecture

-   séparation stricte entre interface, logique métier, accès aux
    données et import/export ;
-   typage strict TypeScript ;
-   gestion explicite des erreurs ;
-   aucune logique métier importante uniquement dans les composants
    visuels ;
-   pas de dépendance obligatoire à un serveur distant pour les calculs
    locaux ;
-   migrations SQLite versionnées ;
-   sauvegarde et restauration de la base ;
-   format monétaire configurable, avec une devise/monnaie de jeu
    configurable et non supposée.

------------------------------------------------------------------------

## 4. Navigation et écrans

Créer une interface sombre, lisible et soignée, inspirée d'un univers
MMORPG fantasy sans copier des éléments protégés. Les icônes et images
doivent provenir de ressources autorisées. Prévoir une interface
responsive, avec priorité à l'écran PC.

Menu principal :

1.  Dashboard
2.  Catalogue
3.  Calculateur de craft
4.  Arbre de fabrication
5.  Scanner de rentabilité
6.  Marché / Prix
7.  Inventaire
8.  Historique
9.  Import / Export
10. Paramètres

### 4.1 Dashboard

Afficher des indicateurs calculés à partir des données disponibles :

-   nombre de recettes importées ;
-   nombre de recettes vérifiées ;
-   nombre de prix renseignés ;
-   nombre de crafts rentables selon les paramètres actifs ;
-   meilleures opportunités connues ;
-   date de dernière mise à jour des prix ;
-   alertes sur les données manquantes ou périmées.

Ne jamais afficher des statistiques fictives en production. Si la base
est vide, afficher un état vide explicatif et proposer l'import de
données.

### 4.2 Catalogue

Fonctions :

-   recherche par nom ;
-   filtres par catégorie, profession, niveau/rang et statut de
    vérification ;
-   tri par nom et catégorie ;
-   fiche détaillée de l'objet ;
-   liste des recettes permettant de produire l'objet ;
-   ingrédients et quantités ;
-   rendement par fabrication ;
-   source, version/région du jeu et date de vérification ;
-   ajout, modification et archivage d'une recette.

Une même ressource peut être produite par plusieurs recettes : le modèle
de données doit le permettre.

### 4.3 Calculateur

L'utilisateur sélectionne une recette et indique une quantité cible. Le
logiciel affiche :

-   quantité réellement à produire compte tenu du rendement par lot ;
-   ingrédients bruts nécessaires ;
-   coûts unitaires utilisés et leur provenance ;
-   coût de chaque ingrédient ;
-   frais supplémentaires éventuels ;
-   coût total ;
-   prix de vente envisagé ;
-   taxe/commission paramétrable ;
-   revenu net ;
-   bénéfice net ;
-   marge ;
-   ROI ;
-   seuil de rentabilité.

Les champs de prix doivent être modifiables directement ou via l'écran
Marché. Les résultats se mettent à jour sans rechargement.

### 4.4 Arbre de fabrication

Pour un objet final, développer récursivement les recettes de ses
composants.

L'arbre doit :

-   distinguer les matières premières des composants craftables ;
-   montrer les quantités nécessaires à chaque niveau ;
-   afficher le coût de chaque branche ;
-   gérer les recettes alternatives ;
-   gérer les rendements par lot et les surplus ;
-   détecter les dépendances circulaires ;
-   éviter le double comptage d'un ingrédient partagé ;
-   permettre de choisir une stratégie pour chaque composant : acheter,
    fabriquer ou choisir automatiquement l'option la moins chère.

Prévoir deux stratégies de valorisation des stocks : - **coût de
trésorerie** : les matériaux déjà possédés ne demandent pas de nouvel
achat ; - **coût économique** : les matériaux possédés sont valorisés à
leur prix de marché/opportunité.

Afficher clairement la stratégie choisie. Ne pas confondre ces deux
résultats.

### 4.5 Comparateur acheter ou fabriquer

Pour chaque composant craftable, comparer :

-   prix d'achat direct ;
-   coût des matières premières ;
-   frais de fabrication ;
-   taxes éventuelles applicables ;
-   coût de fabrication par unité utilisable ;
-   coût d'opportunité des matériaux possédés, selon le mode choisi.

Afficher l'option la moins chère uniquement si les données nécessaires
sont disponibles. Sinon, afficher « comparaison incomplète » avec la
liste des prix manquants.

### 4.6 Scanner de rentabilité

Créer un tableau triable et filtrable avec :

-   icône/image si disponible ;
-   nom ;
-   catégorie ;
-   coût unitaire ;
-   prix de vente ;
-   taxe ;
-   bénéfice net ;
-   marge nette ;
-   ROI ;
-   quantité simulée ;
-   fraîcheur des prix ;
-   statut de fiabilité des données.

Filtres : catégorie, profession, recette vérifiée, bénéfice
positif/négatif, marge minimale, ROI minimal, prix actualisés.

Ne classe pas une recette comme opportunité fiable si son prix de vente
ou un coût essentiel manque ou est périmé. Prévoir un filtre permettant
de voir les résultats incomplets séparément.

### 4.7 Marché et prix

Permettre de saisir séparément :

-   prix d'achat ;
-   prix de vente ;
-   quantité observée, si disponible ;
-   serveur/région ou marché ;
-   source ;
-   date et heure de l'observation ;
-   commentaire facultatif.

Ne pas supposer que le prix le plus bas est le prix auquel l'utilisateur
vendra réellement. Distinguer prix d'achat, prix de vente observé et
prix de vente estimé.

Prévoir une interface de connecteurs de marché. Un connecteur
automatique ne peut être activé que si une source fiable, autorisée et
documentée est identifiée. Sinon, le logiciel doit fonctionner avec
saisie manuelle et import de fichiers.

### 4.8 Inventaire

Permettre d'enregistrer les quantités possédées, de les modifier et de
les déduire d'un plan de fabrication.

Afficher :

-   quantité possédée ;
-   quantité requise ;
-   quantité manquante ;
-   quantité à acheter ;
-   coût d'achat complémentaire ;
-   valeur économique estimée du stock, si un prix est disponible.

### 4.9 Historique

Enregistrer les observations de prix sans écraser les anciennes.
Afficher graphiques et historique uniquement lorsque plusieurs
observations existent. Afficher la période couverte et les éventuels
trous dans les données.

### 4.10 Import / Export

Prévoir :

-   import CSV ;
-   import XLSX si raisonnable ;
-   export CSV ;
-   export JSON complet ;
-   sauvegarde/restauration SQLite.

L'import doit comporter une prévisualisation, une validation, un rapport
d'erreurs et une confirmation avant écriture. Ne jamais écraser
silencieusement les données existantes.

Fournir des modèles CSV documentés pour les objets, recettes,
ingrédients, prix et inventaire.

------------------------------------------------------------------------

## 5. Règles de calcul métier

Toutes les quantités et valeurs monétaires doivent être traitées avec
précision. Évite les erreurs d'arrondi des nombres flottants pour les
montants : utiliser des entiers dans la plus petite unité monétaire
disponible ou une bibliothèque décimale.

### 5.1 Coût d'une recette simple

Pour chaque ingrédient :

`coût ingrédient = quantité requise × prix unitaire`

`coût recette = somme des coûts ingrédients + frais de fabrication`

Si une recette produit plusieurs unités :

`coût unitaire = coût recette / quantité produite`

Le coût unitaire peut être décimal dans le calcul interne même si les
objets sont entiers.

### 5.2 Production par lots

Pour une quantité cible `Q` et un rendement `Y` par exécution :

`nombre d'exécutions = plafond(Q / Y)`

`quantité produite = nombre d'exécutions × Y`

Calculer les ingrédients sur le nombre réel d'exécutions, pas uniquement
sur la quantité cible. Afficher le surplus produit.

### 5.3 Vente et commission

Pour un prix unitaire de vente `P`, une quantité vendue `Q` et un taux
de commission `t` :

`revenu net = P × Q × (1 - t)`

`bénéfice net = revenu net - coût total`

Si des frais fixes existent, les modéliser séparément. Ne pas supposer
un taux de commission AION 2 : le rendre configurable et afficher sa
source.

### 5.4 Indicateurs

`ROI (%) = bénéfice net / coût total × 100`

`Marge nette (%) = bénéfice net / revenu net × 100`

Gérer explicitement les divisions par zéro et les coûts/revenus nuls.
Afficher « non calculable » quand nécessaire, plutôt qu'une valeur
trompeuse.

### 5.5 Prix minimum de vente

Calculer le prix minimum permettant de couvrir le coût total, en tenant
compte de la commission et des frais configurés. Documenter la méthode
d'arrondi et le fait que le prix final doit être un prix de vente
réalisable.

### 5.6 Chaînes de fabrication

Le moteur doit comparer plusieurs stratégies : - acheter le composant
; - fabriquer le composant ; - utiliser le stock ; - combiner stock,
achat et fabrication.

Pour les recettes alternatives, rechercher le coût total le plus bas
selon les prix disponibles et la stratégie sélectionnée. Conserver le
détail du choix effectué afin que l'utilisateur puisse comprendre le
calcul.

Détecter les cycles de recettes et arrêter proprement le calcul avec une
erreur explicite.

Ne jamais traiter un prix manquant comme zéro. Un calcul incomplet doit
rester incomplet.

------------------------------------------------------------------------

## 6. Modèle de données suggéré

Adapter ce schéma si nécessaire, mais conserver les concepts et les
relations.

### `items`

-   `id`
-   `name`
-   `normalized_name`
-   `category_id`
-   `description`
-   `icon_path`
-   `game_region`
-   `game_version`
-   `verification_status`
-   `source_id`
-   `last_verified_at`
-   `created_at`
-   `updated_at`

### `categories`

-   `id`
-   `name`
-   `parent_id`

### `professions`

-   `id`
-   `name`

### `recipes`

-   `id`
-   `output_item_id`
-   `profession_id`
-   `required_level`
-   `output_quantity`
-   `craft_fee`
-   `notes`
-   `game_region`
-   `game_version`
-   `verification_status`
-   `source_id`
-   `last_verified_at`
-   `created_at`
-   `updated_at`

### `recipe_ingredients`

-   `id`
-   `recipe_id`
-   `ingredient_item_id`
-   `quantity`

### `market_prices`

-   `id`
-   `item_id`
-   `market_id`
-   `price_type` (buy/sell)
-   `unit_price`
-   `quantity_observed`
-   `source_id`
-   `observed_at`

### `markets`

-   `id`
-   `name`
-   `region`
-   `server`
-   `description`

### `data_sources`

-   `id`
-   `name`
-   `url`
-   `source_type`
-   `terms_or_notes`
-   `is_authorized`
-   `created_at`

### `inventory`

-   `id`
-   `item_id`
-   `quantity`
-   `updated_at`

### `settings`

-   `key`
-   `value`

Ajouter les index, contraintes de clés étrangères et règles d'unicité
nécessaires. Utiliser des migrations versionnées. Éviter les
suppressions en cascade dangereuses sur les données importantes.

------------------------------------------------------------------------

## 7. Qualité, sécurité et tests

### Tests indispensables

Écrire des tests unitaires pour :

-   coût d'une recette simple ;
-   rendement par lot et surplus ;
-   taxes et commissions ;
-   bénéfice, ROI et marge ;
-   prix de vente minimum ;
-   ingrédient manquant ;
-   prix périmé ;
-   stock partiel ;
-   composant intermédiaire ;
-   ingrédient partagé entre plusieurs branches ;
-   recettes alternatives ;
-   cycle de dépendances ;
-   import invalide ;
-   données de régions différentes.

Créer des jeux de tests fictifs clairement marqués comme tels. Ils
servent à vérifier les calculs et ne doivent jamais être intégrés au
catalogue réel comme recettes AION confirmées.

### Sécurité et robustesse

-   valider toutes les entrées utilisateur et les fichiers importés ;
-   limiter les permissions Tauri au strict nécessaire ;
-   ne pas exécuter de code provenant d'un fichier importé ;
-   ne pas exposer de secrets dans le frontend ;
-   gérer les erreurs sans perdre les données ;
-   sauvegarder avant les migrations risquées ;
-   documenter la restauration.

------------------------------------------------------------------------

## 8. Design et expérience utilisateur

Direction artistique : interface sombre, fantasy élégante, lisible et
fonctionnelle.

-   fond anthracite/bleu nuit ;
-   accents dorés ou bleu froid avec parcimonie ;
-   typographie très lisible ;
-   tableaux denses mais aérés ;
-   icônes cohérentes ;
-   états visuels distincts : rentable, non rentable, données
    manquantes, prix périmé ;
-   infobulles expliquant les calculs ;
-   navigation clavier et accessibilité de base.

Éviter les effets visuels excessifs. La lisibilité des chiffres est
prioritaire.

------------------------------------------------------------------------

## 9. Structure de projet suggérée

Proposer une structure proche de celle-ci, à adapter au template Tauri
choisi :

``` text
aion2-craft-profit-manager/
├── src/
│   ├── app/
│   ├── components/
│   ├── pages/
│   ├── features/
│   │   ├── dashboard/
│   │   ├── catalogue/
│   │   ├── calculator/
│   │   ├── crafting-tree/
│   │   ├── profit-scanner/
│   │   ├── market/
│   │   ├── inventory/
│   │   └── import-export/
│   ├── domain/
│   │   ├── models/
│   │   ├── calculations/
│   │   └── validation/
│   ├── services/
│   └── styles/
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   └── migrations/
├── data/
│   ├── templates/
│   └── documentation/
├── tests/
├── docs/
├── README.md
└── package.json
```

------------------------------------------------------------------------

## 10. Plan d'exécution obligatoire

### Étape 0 --- Audit et plan

-   inspecter le dépôt ;
-   vérifier les outils installés ;
-   vérifier les versions et prérequis Tauri 2 ;
-   proposer un plan court ;
-   identifier les risques et inconnues ;
-   ne pas supprimer de fichiers existants.

### Étape 1 --- Socle exécutable

-   créer/configurer le projet ;
-   lancer l'application Windows en développement ;
-   mettre en place le thème et la navigation ;
-   configurer SQLite et les migrations ;
-   créer les états vides.

**Critère de validation :** l'application démarre et la base locale est
créée.

### Étape 2 --- Données et catalogue

-   implémenter les modèles ;
-   créer les écrans catalogue et fiche objet ;
-   créer les modèles CSV ;
-   implémenter l'import avec prévisualisation ;
-   intégrer uniquement les données Global vérifiées disponibles.

**Critère de validation :** importer, consulter, modifier et exporter
des recettes sans perte de données.

### Étape 3 --- Moteur de calcul

-   implémenter les calculs simples ;
-   implémenter les lots ;
-   implémenter les stocks ;
-   implémenter l'arbre de dépendances ;
-   implémenter achat/fabrication ;
-   écrire les tests.

**Critère de validation :** tous les tests métier passent et les
résultats sont explicables.

### Étape 4 --- Marché et scanner

-   saisir les prix ;
-   gérer leur historique et leur fraîcheur ;
-   calculer les opportunités ;
-   filtrer et trier ;
-   isoler les données incomplètes.

**Critère de validation :** le scanner ne présente pas comme fiable une
recette dont les données essentielles sont absentes ou périmées.

### Étape 5 --- Finalisation Windows

-   sauvegarde/restauration ;
-   gestion des erreurs ;
-   tests de bout en bout ;
-   build de production ;
-   création de l'installateur Windows ;
-   documentation d'installation et de dépannage.

**Critère de validation :** une installation propre fonctionne sur
Windows et conserve les données entre deux lancements.

------------------------------------------------------------------------

## 11. Gestion des données AION 2 Global

C'est un risque majeur du projet : la qualité de l'analyse dépend de la
qualité des recettes et des prix.

Tu dois :

1.  rechercher des sources publiques, fiables et compatibles avec la
    version Global ;
2.  vérifier la région et la version des données ;
3.  enregistrer la source et la date de vérification ;
4.  séparer clairement données officielles, communautaires et saisies
    par l'utilisateur ;
5.  prévoir un import CSV/JSON pour compléter le catalogue ;
6.  signaler les recettes manquantes au lieu de les inventer ;
7.  ne pas scraper un service sans vérifier ses conditions
    d'utilisation.

Si aucune source Global complète n'est disponible, indique-le clairement
dans `docs/DATA_SOURCES.md` et livre le système d'importation. Ne
remplis pas artificiellement la base avec des recettes d'autres régions.

------------------------------------------------------------------------

## 12. Livrables attendus

À la fin du projet, fournir :

-   le code source complet ;
-   l'application Windows compilée ;
-   l'installateur Windows ;
-   les migrations SQLite ;
-   les modèles CSV d'import ;
-   les tests automatisés ;
-   la documentation utilisateur ;
-   la documentation technique ;
-   `docs/DATA_SOURCES.md` ;
-   une liste des fonctionnalités terminées, partielles et non
    disponibles ;
-   les limites connues, notamment sur les prix automatiques et
    l'exhaustivité des recettes Global.

Ne marque aucune étape comme terminée si son critère de validation n'est
pas satisfait.

------------------------------------------------------------------------

## 13. Première action à effectuer

Commence par **inspecter le dépôt et l'environnement**, puis présente un
plan d'implémentation concis.

Ensuite, commence immédiatement l'étape 1 : construire un socle
exécutable de l'application Windows, avec navigation, thème, SQLite et
migrations.

Ne te contente pas de me donner des conseils ou des extraits de code :
travaille directement dans les fichiers du projet. À chaque étape,
indique les fichiers créés/modifiés, les commandes exécutées, les tests
réalisés et leur résultat.

Si tu travailles dans un dépôt vide, initialise le projet proprement. Si
le dépôt contient déjà du code, conserve et adapte l'existant.


------------------------------------------------------------------------

## 15. Communication, skills and session handoff rules

These rules are mandatory throughout the entire project.

### 15.1 English-only communication

- Claude Code must communicate with the user **only in English**.
- All replies, explanations, questions, progress reports, warnings, summaries and handoff notes must be written in English.
- All project documentation, comments intended for the developer, commit messages and technical notes must also be written in English.
- If the user writes in another language, understand the request and reply in English.
- Do not switch languages unless the user explicitly asks you to.

### 15.2 Use all skills provided in the conversation

- Before starting work, inspect the skills and instructions that the user has made available in the conversation or development environment.
- Read the instructions for every available skill that is relevant to the current task, and use those skills when carrying out the work.
- Do not ignore, silently skip or replace a relevant provided skill with an improvised workflow.
- If a skill is unavailable, cannot be read, or is not relevant to the current task, state that clearly in the progress report.
- At the beginning of each new session, check the available skills again and read the relevant instructions before continuing.
- Follow each skill's usage rules and any tool-specific requirements. Never claim to have used a skill unless you actually did.

### 15.3 Session handoff (relaxed 2026-10-31)

- Prepare a handoff when the session is likely to end, when context is becoming limited, when the user asks, or roughly every 30 user messages as a safety net.
- Do not count Claude Code's own replies as user messages.
- If the user asks for a handoff earlier, prepare it immediately.
- Do not stop mid-task purely to hit a message counter; finish or safely pause the current operation first, then hand off.

### 15.4 Required handoff procedure

At each handoff checkpoint:

1. Finish or safely pause the current operation. Do not leave files half-written or the project in a knowingly broken state.
2. Run the relevant tests and checks. Record which commands were run and their actual results. Do not claim tests passed if they were not run.
3. Update the existing Markdown documentation files (`.md`) that are relevant to the work.
4. Create or update a root-level `HANDOFF.md` containing:
   - project name and purpose;
   - current project phase;
   - what has been implemented and where;
   - what has been tested, including exact commands and results;
   - known bugs, blockers and unfinished work;
   - important technical decisions and assumptions;
   - data sources and verification status for AION 2 Global recipes and market data;
   - the next concrete tasks, in priority order;
   - the exact first action the next session should perform.
5. Update the relevant progress or status documentation if such files exist (for example, `PROJECT_STATUS.md`, `CHANGELOG.md` or a development log). Do not create duplicate status files if an appropriate one already exists.
6. Preserve the README's original product requirements and core instructions. **Do not rewrite, replace, shorten, reorder or silently modify the original specification to turn it into a progress report.**
7. Add progress information to the appropriate progress/handoff document. If a README update is genuinely necessary, add a clearly separated dated progress note or link to the handoff; do not mix implementation notes into the original requirements.
8. Make sure the handoff is self-contained enough that a new Claude Code session can continue without relying on the previous conversation.

### 15.5 Exact instructions for the next session

At the end of every handoff, include a section titled `Next session instructions` in `HANDOFF.md` with a ready-to-follow instruction for the next Claude Code session. It must tell the next session to:

- read `README.md` in full first, preserving it as the authoritative product specification;
- read `HANDOFF.md` and the current project status/changelog files;
- inspect the actual repository state instead of assuming the previous session's work is complete;
- re-check and read all relevant user-provided skills;
- verify the reported tests and unfinished tasks where appropriate;
- continue from the first unfinished priority without recreating completed work;
- communicate only in English;
- keep following every requirement in the README.

The handoff must describe the real state of the repository, not an optimistic or invented summary. The goal is for a fresh session to understand immediately what has been done, what remains, and exactly what to do next.


------------------------------------------------------------------------

## 16. AION 2 Global market data integration — research and implementation requirements

### 16.1 Current research findings (checked October 31, 2026)

The project must distinguish between an **official public API**, an **unofficial community data source**, and a **private/internal game endpoint**.

- No documented, officially supported public NCSOFT API for AION 2 Global market listings or market price history was identified during this research.
- Community websites already publish useful market information:
  - `https://www.aion2.market/` describes observed prices and price history for European servers. Its website states that these are observed prices, not live guaranteed prices, and that listings do not represent completed sales.
  - `https://aion2.gaming.tools/crafting-calculator` offers a crafting calculator with server-specific market pricing options, including cheapest current listing and typical price over 48 hours. It requires a market server selection.
  - `https://daevaforge.com/` describes a crafting calculator using market prices sourced from Aion2Market, with prices refreshed hourly according to its site.
- Community discussion has mentioned use of internal game HTTP endpoints for market data, but this is not evidence of an officially supported API. Such endpoints may be undocumented, unstable, subject to rate limits, or carry account and Terms of Service risks. **Do not reverse-engineer, call, automate, or depend on private game endpoints unless their use is explicitly confirmed to be permitted and safe.**
- A separate community API project found during research documents character, equipment and server information; that documentation is not proof of a public market-price API. Do not mistake character APIs for market APIs.

Research references:
- AION2 Market: `https://www.aion2.market/`
- AION 2 Gaming Tools crafting calculator: `https://aion2.gaming.tools/crafting-calculator`
- Daeva Forge: `https://daevaforge.com/`
- Community discussion about market data collection and internal endpoints: `https://www.reddit.com/r/Aion2/comments/1wyrc6m/aion_2_market_data/`
- Example of a separate AION 2 community API (character/server data, not a market API): `https://github.com/axsddlr/aion2_api`

These findings are a starting point for technical investigation, not a guarantee that any third-party service provides a stable, public, documented API. Re-check availability, terms, coverage and data freshness before implementing an integration.

### 16.2 Required market data source investigation

Before writing any automatic market connector:

1. Inspect the public websites and their official documentation, if any.
2. Check whether each source offers a documented API, downloadable dataset, public export, or other explicitly permitted integration method.
3. Verify whether access is allowed for a desktop application and whether attribution, authentication, caching, rate limits or other restrictions apply.
4. Determine which regions, servers, factions and items are covered.
5. Determine what each price actually represents:
   - lowest active listing / cheapest ask;
   - typical or median listing price;
   - historical observed listing price;
   - completed sale price, only if the source genuinely provides it.
6. Determine update frequency, timestamp semantics, missing-data behavior and rate limits.
7. Record the research result in project documentation, including the date checked and source links.
8. If the source is a public, keyless, read-only API or a public data file, integrate it with good-citizen behaviour: honest User-Agent, rate limits, caching and attribution. Only sources behind logins, bot walls or private/internal game endpoints remain off-limits. Record what is known — and explicitly not known — about each source's terms in `docs/DATA_SOURCES.md`; unknown terms are documented, not blocking.

### 16.3 Market connector architecture

Implement market integrations through independent provider adapters. Do not couple the calculation engine or UI directly to one website.

Suggested architecture:

- `MarketDataProvider` interface defining supported operations and capabilities.
- One adapter per approved provider.
- A provider registry allowing sources to be enabled or disabled independently.
- A normalization layer converting source responses into the application's common market-price model.
- A cache and refresh scheduler that obeys each provider's documented limits.
- A source status panel showing connection state, last successful refresh, last error and coverage.
- Manual price entry and CSV/XLSX import must continue working when every automatic provider is unavailable.

Do not add credentials, API keys or tokens to source control. Store secrets using an appropriate secure mechanism for the Windows application, and only request credentials when a provider genuinely requires them.

### 16.4 Normalized market price record

Every imported or retrieved price must preserve its provenance. Store at least:

- item identifier and item display name;
- region;
- server;
- faction, when relevant;
- currency;
- price per unit;
- listing quantity, when supplied;
- price type (`lowest_listing`, `typical_listing`, `median_listing`, `sale_price`, or `unknown`);
- source/provider name;
- source record identifier or source URL, when available;
- observation timestamp from the provider;
- retrieval timestamp in the application;
- freshness/status indicator;
- confidence or verification status;
- raw source payload or a safe, minimal diagnostic snapshot where permitted.

Provider fields whose meaning is not fully documented may still be stored under a `community` or `unknown` status with a note; dropping them is not required. The strict rule is only that they must never be presented as confirmed completed-sale prices.

Never label an asking/listing price as a completed sale price. Never combine data from different servers, regions or factions as if they were interchangeable.

### 16.5 User experience and price selection

The Market page must:

- Let the user select the correct region, server and faction where applicable.
- Show the provider and the exact time the price was observed or refreshed.
- Clearly distinguish live/active listings from historical or typical prices.
- Show stale, unavailable, incomplete or unverified data instead of silently presenting it as current.
- Allow the user to choose a preferred source and price method.
- Allow manual override without deleting the original imported observation.
- Provide a manual refresh action, while respecting provider rate limits.
- Display a clear warning when no reliable price is available.
- Never silently fall back to another server or region.

The crafting profitability engine must be able to use a selected price method consistently and show which source and observation were used in each calculation.

### 16.6 Fallback order

Use this order when resolving a market price:

1. A valid, permitted and configured automatic provider for the exact selected region/server/faction.
2. A user-entered price for the same market context, if the user has chosen manual override or the automatic source is unavailable.
3. A recent imported CSV/XLSX price for the same market context.
4. Otherwise, mark the price as missing and ask the user to provide it.

Do not silently use prices from another region, server, faction, game version or AION 2 KR/TW dataset as a Global price.

### 16.7 Implementation acceptance criteria

- The application works fully for manual pricing when offline.
- A provider failure cannot crash the application or block crafting calculations.
- Provider adapters have automated tests using saved, anonymized fixtures; tests must not depend on live websites.
- Parsing errors, rate limits and network errors are handled and shown clearly.
- Duplicate observations are handled deterministically.
- The UI shows the source and timestamp for every automatic price.
- The app never claims that data is real-time unless the provider guarantees that and the observation timestamp supports it.
- No private endpoint, anti-cheat bypass, game-client modification, credential extraction or prohibited automation is introduced.
- The provider's terms and permitted usage are documented before release; where a public, keyless, read-only provider has no written terms, that fact is recorded and does not block the release.
