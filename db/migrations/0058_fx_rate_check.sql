-- SQLite cannot add a CHECK to an existing table, so the 20..200 PHP-per-USD band
-- that apps/api/src/fx/rates.ts enforces before storing is enforced here too.
-- Rows stored before this migration are not re-validated on read.
CREATE TRIGGER `fx_rates_usd_to_php_range_insert`
BEFORE INSERT ON `fx_rates`
FOR EACH ROW WHEN NEW.`usd_to_php` < 20 OR NEW.`usd_to_php` > 200
BEGIN
  SELECT RAISE(ABORT, 'fx_rate_out_of_range');
END;
--> statement-breakpoint
CREATE TRIGGER `fx_rates_usd_to_php_range_update`
BEFORE UPDATE OF `usd_to_php` ON `fx_rates`
FOR EACH ROW WHEN NEW.`usd_to_php` < 20 OR NEW.`usd_to_php` > 200
BEGIN
  SELECT RAISE(ABORT, 'fx_rate_out_of_range');
END;
