# APIs de prix Market — AION 2 Global

Récapitulatif des APIs et sources de données pour les prix du Market (hôtel des ventes) d'AION 2 Global. Vérifié le 31 octobre 2026.

## Point clé : pas d'API officielle de prix

NCSOFT ne publie **aucune API de prix du Market** pour AION 2. Le portail développeur officiel de PLAYNC (`developers.plaync.com`) n'expose de données de jeu (items, prix, recherche) que pour **Lineage 2M** ; AION 2 n'y est pas inclus. Les prix étant fixés par les joueurs et propres à chaque serveur, tous les trackers ci-dessous sont des projets communautaires qui collectent eux-mêmes les données.

## APIs communautaires de prix

### aion2.exchange (Aion2Market) — la principale source

API JSON publique, sans clé. C'est la source de données de plusieurs sites (Aion 2 Timers, aion2-craft). Couverture : annonces au plus bas par serveur + historique de prix.

| Endpoint | Usage |
|---|---|
| `GET https://aion2.exchange/api/servers` | Liste des serveurs (IDs) |
| `GET https://aion2.exchange/api/items?sort=name&order=asc&window=24h&limit=200&offset={off}&server={server}` | Annonces et ventes, paginé par 200 (`{off}` = offset, `{server}` = ID serveur) |
| `GET https://aion2.exchange/api/items/{k}/prices?server={server}&from={since}&bucket=10m` | Historique de prix d'un item (`{k}` = clé item, `{since}` = timestamp UTC de début) |

Remarque : le site lui-même bloque les robots, mais l'API répond en JSON direct.

### aion2.market

Prix observés et historique sur les serveurs européens (Elyos/Asmodiens séparés), ~8 000 items dont ~1 700 échangeables. Pas d'API publique documentée — site web uniquement.

### a2-tracker.com

Annonces (asks) sur les 106 mondes AION 2 (EU, NA Est/Ouest, Asie, Amérique latine), rafraîchi en continu, prix marqués "périmés" après 15 min. Pas d'API publique documentée — site web uniquement.

### aion2craft.com — table Supabase publique (Corée)

Backend exposé via Supabase PostgREST, lecture anonyme autorisée :

```
https://<projet>.supabase.co/rest/v1/market_prices
```

Champs : `item_id_raw`, `item_code`, `item_name`, `server_id`, `market_type` (server/world), `race`, `price`, `updated_at`, `source`. Attention : saisie manuelle communautaire, couverture coréenne, fiabilité inégale.

### dimkk/aion2-market-stack — self-hosted

Stack à héberger soi-même ([GitHub](https://github.com/dimkk/aion2-market-stack)) : collecteur read-only qui observe la session du client AION 2, décode le flux Market, stocke les prix en SQLite et sert une "Economy API" + UI locale sur `http://127.0.0.1:8080`. Permet de construire son propre historique sans dépendre d'un tiers.

## APIs officielles NCSOFT (sans prix)

Le site officiel expose des endpoints JSON non documentés, mais **aucun prix de Market** :

| Endpoint | Contenu |
|---|---|
| `https://api-global-community.plaync.com/aion2_global/board/{board_alias}` | Boards d'annonces officielles (notice_en, notice_fr…) |
| `https://aion2.plaync.com/en-us/api/gameinfo/servers?region={nae\|naw\|eu\|la\|as}` | Liste des serveurs Global (identité seulement) |
| `https://api-search.plaync.com/aion2global/search/v2/character?keyword=…&region=…` | Recherche de personnages |

Clients tout faits : [nuriland/aion2-api](https://github.com/nuriland/aion2-api) (Go, KR/TW/Global, avec serveur MCP) et [axsddlr/aion2_api](https://github.com/axsddlr/aion2_api) (Python, CLI). Note : "Global has no item catalog" — pas de catalogue d'items côté Global.

## Sources complémentaires

- **In-game** : le jeu publie lui-même des statistiques de ventes sur 28 jours pour matériaux et consommables (visibles dans le client, pas d'API).
- **[gamers4.life](https://gamers4.life/aion-2/database/crafting-graph.json)** : graphe de craft (recettes, items, icônes) en JSON, utile pour croiser avec les prix.
- **[huntervault.app](https://huntervault.app/tools/aion2/market/)** : pas de prix, mais calculateur de profit + journal de prix privé (navigateur).
- **[aion2.gaming.tools](https://aion2.gaming.tools)** : population des serveurs (pas de prix).

## Limites à connaître

- Tous les prix disponibles sont des **annonces** (asks) ou observations, jamais des ventes confirmées — sauf les stats 28 jours du jeu.
- Les prix varient fortement **d'un serveur à l'autre** ; chaque monde a son propre marché.
- Le Market Global nécessite un **Special Quai Membership** (~14,99 $/30 jours) et le niveau 45.
- Ces APIs ne sont pas officielles : elles peuvent changer ou disparaître sans préavis.

## Sources

- [aion2.exchange — endpoints relevés dans le code de aion2-craft](https://github.com/shizukaziye/aion2-craft)
- [Aion 2 Timers — "Market data from Aion2Market (aion2.exchange)"](https://www.aion2timers.com/exchange/)
- [dodsas/aion2 — confirmation qu'il n'y a pas d'API officielle (vérif. 2026-07-08)](https://github.com/dodsas/aion2)
- [A2-Tracker](https://a2-tracker.com/) · [aion2.market](https://aion2.market/) · [huntervault — Market Guide](https://huntervault.app/tools/aion2/market/)
- [dimkk/aion2-market-stack](https://github.com/dimkk/aion2-market-stack) · [nuriland/aion2-api](https://github.com/nuriland/aion2-api) · [axsddlr/aion2_api](https://github.com/axsddlr/aion2_api)
