-- DeepSeek retired `deepseek-v4-flash` and only routes it to V4.1 Flash for a while. Its
-- replacement, `deepseek-flash`, is a moving alias for the current Flash release. Configs an
-- admin already moved keep their choice: a row is renamed only when no `deepseek-flash` row
-- exists for its service, so the (service, provider, model) unique index holds.
UPDATE `provider_configs`
SET `model` = 'deepseek-flash',
	`display_name` = CASE
		WHEN `display_name` IS NULL OR `display_name` = 'deepseek / deepseek-v4-flash'
			THEN 'deepseek / deepseek-flash'
		ELSE `display_name`
	END,
	`updated_at` = datetime('now')
WHERE `provider` = 'deepseek'
	AND `model` = 'deepseek-v4-flash'
	AND NOT EXISTS (
		SELECT 1 FROM `provider_configs` AS `current`
		WHERE `current`.`service` = `provider_configs`.`service`
			AND `current`.`provider` = 'deepseek'
			AND `current`.`model` = 'deepseek-flash'
	);
