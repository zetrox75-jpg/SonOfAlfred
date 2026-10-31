-- Links a market to exactly one provider server (e.g. 'aion2.exchange:11304'), so automatic
-- prices land in that market only: never in another server or faction (README 16.5).
ALTER TABLE markets ADD COLUMN provider_server TEXT;
CREATE UNIQUE INDEX ux_markets_provider_server ON markets (provider_server) WHERE provider_server IS NOT NULL;
