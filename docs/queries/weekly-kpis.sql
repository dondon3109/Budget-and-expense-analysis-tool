-- Weekly growth KPIs (D1 / SQLite). Read-only. See "Weekly growth KPIs" in docs/analytics.md.
--
-- One row per week (Monday to Sunday, UTC) for the last 12 weeks, newest last, in the column
-- order of the growth tracker's Weekly KPIs tab, so a run pastes straight in. site_visitors is
-- always NULL: visitors come from PostHog web analytics, not D1.
--
-- signups: personal workspaces created that week (user_tenants.created_at, written on a person's
--   first signed-in request).
-- activated: of that week's signups, those who entered 3 or more transactions within 7 days of
--   signing up. Only rows with an entry method count, so opening balances and other system
--   entries never activate anyone. The current and previous week can still rise.
-- paying_customers, mrr_php: paid subscriptions live at the end of the week. D1 keeps only each
--   subscription's latest state, so a subscription that is now canceled or paused counts until
--   its last update (taken as the time it ended). trialing is not paying. MRR counts an annual
--   plan as a twelfth of its price, in whole pesos.
-- new_paid: paid subscriptions created that week. churned: subscriptions that moved to canceled
--   that week.
--
-- Platform admin accounts (platform_admin_grants) are left out of every count, so test
-- purchases and the owner's own workspace never inflate the numbers.
--
-- Plan prices must match PLAN_PRICES_MINOR in packages/shared/src/plans.ts (pinned by
-- apps/api/tests/weekly-kpis-query.test.ts).
WITH RECURSIVE
  weeks(week_start, n) AS (
    SELECT date('now', 'weekday 0', '-6 days', '-77 days'), 1
    UNION ALL
    SELECT date(week_start, '+7 days'), n + 1 FROM weeks WHERE n < 12
  ),
  people AS (
    SELECT link.user_id, link.tenant_id, link.created_at
    FROM user_tenants AS link
    WHERE link.user_id NOT IN (SELECT user_id FROM platform_admin_grants)
  ),
  activated_people AS (
    SELECT p.user_id
    FROM people AS p
    JOIN transactions AS t
      ON t.tenant_id = p.tenant_id
     AND t.entry_method IS NOT NULL
     AND t.deleted_at IS NULL
     AND t.created_at < datetime(p.created_at, '+7 days')
    GROUP BY p.user_id
    HAVING COUNT(DISTINCT COALESCE(t.transfer_group_id, t.id)) >= 3
  ),
  paid AS (
    SELECT
      s.status,
      s.created_at,
      s.updated_at,
      CASE COALESCE(s.plan, s.entitled_plan, 'pro') || ':' || COALESCE(s.interval, 'month')
        WHEN 'budget:month' THEN 14900 * 12
        WHEN 'budget:year' THEN 149000
        WHEN 'pro:month' THEN 24900 * 12
        WHEN 'pro:year' THEN 249000
        WHEN 'family_budget:month' THEN 49900 * 12
        WHEN 'family_budget:year' THEN 499000
        WHEN 'family_pro:month' THEN 79900 * 12
        WHEN 'family_pro:year' THEN 799000
      END AS annual_minor
    FROM billing_subscriptions AS s
    WHERE s.status <> 'trialing'
      AND s.tenant_id NOT IN (
        SELECT tenant_id FROM user_tenants
        WHERE user_id IN (SELECT user_id FROM platform_admin_grants)
      )
  )
SELECT
  w.week_start AS week_of,
  NULL AS site_visitors,
  (SELECT COUNT(*) FROM people AS p
    WHERE date(p.created_at) >= w.week_start AND date(p.created_at) < date(w.week_start, '+7 days')) AS signups,
  (SELECT COUNT(*) FROM people AS p
    JOIN activated_people AS a ON a.user_id = p.user_id
    WHERE date(p.created_at) >= w.week_start AND date(p.created_at) < date(w.week_start, '+7 days')) AS activated,
  (SELECT COUNT(*) FROM paid
    WHERE date(paid.created_at) < date(w.week_start, '+7 days')
      AND (paid.status IN ('active', 'past_due') OR date(paid.updated_at) >= date(w.week_start, '+7 days'))) AS paying_customers,
  (SELECT COALESCE(SUM(paid.annual_minor), 0) / 1200 FROM paid
    WHERE date(paid.created_at) < date(w.week_start, '+7 days')
      AND (paid.status IN ('active', 'past_due') OR date(paid.updated_at) >= date(w.week_start, '+7 days'))) AS mrr_php,
  (SELECT COUNT(*) FROM paid
    WHERE date(paid.created_at) >= w.week_start AND date(paid.created_at) < date(w.week_start, '+7 days')) AS new_paid,
  (SELECT COUNT(*) FROM paid
    WHERE paid.status = 'canceled'
      AND date(paid.updated_at) >= w.week_start AND date(paid.updated_at) < date(w.week_start, '+7 days')) AS churned
FROM weeks AS w
ORDER BY w.week_start;
