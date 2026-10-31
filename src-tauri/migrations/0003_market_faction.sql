-- Markets are per region / server / faction (README 16.5): prices from different
-- markets are never mixed.
ALTER TABLE markets ADD COLUMN faction TEXT;
