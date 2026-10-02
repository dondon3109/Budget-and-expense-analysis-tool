-- Goal retention report (D1 / SQLite). Read-only. See "Goal retention report" in docs/analytics.md.
--
-- One row per cohort: each primary goal, 'skipped' (chose to skip the goal screen), and
-- 'shown_no_answer' (saw the screen, neither chose nor skipped).
--
-- Anchor: goal_selected_at (the first time a goal was chosen, kept when the goal later changes, so
-- a workspace stays in the cohort of its current goal but is timed from its first choice). Skippers
-- are timed from their onboarding_goal_skipped event and shown_no_answer from onboarding_goal_shown.
--
-- Activation: a first_action_completed event within 24 hours of the anchor. Goal cohorts only; the
-- event is derived from workspace data created after the anchor, so skipped cohorts show NULL.
--
-- Returned on day N: the workspace created a transaction, assistant question, budget, savings
-- goal, debt, or import on the calendar day (UTC) that is N days after the anchor's day. This
-- is measured from existing created_at timestamps, not from request logs, so it counts people who
-- add something, not people who only open the app.
--
-- Eligibility: a workspace counts toward a window only once that window is over (the anchor plus 24
-- hours for activation, the whole of calendar day N for D1, D7, and D30), so young cohorts are not
-- penalized. Rates are percentages of eligible workspaces; NULL when none are eligible yet.
WITH cohort AS (
  SELECT
    tenants.id AS tenant_id,
    CASE
      WHEN tenants.primary_goal IS NOT NULL THEN tenants.primary_goal
      WHEN tenants.goal_skipped = 1 THEN 'skipped'
      ELSE 'shown_no_answer'
    END AS cohort,
    COALESCE(
      tenants.goal_selected_at,
      (SELECT MIN(created_at) FROM goal_events
         WHERE tenant_id = tenants.id AND name = 'onboarding_goal_skipped'),
      (SELECT MIN(created_at) FROM goal_events
         WHERE tenant_id = tenants.id AND name = 'onboarding_goal_shown')
    ) AS anchor_at
  FROM tenants
  WHERE tenants.primary_goal IS NOT NULL
    OR tenants.goal_skipped = 1
    OR EXISTS (SELECT 1 FROM goal_events
                 WHERE tenant_id = tenants.id AND name = 'onboarding_goal_shown')
),
activity AS (
  SELECT tenant_id, date(created_at) AS day FROM transactions WHERE deleted_at IS NULL
  UNION SELECT tenant_id, date(created_at) FROM assistant_messages WHERE role = 'user'
  UNION SELECT tenant_id, date(created_at) FROM budgets
  UNION SELECT tenant_id, date(created_at) FROM financial_goals
  UNION SELECT tenant_id, date(created_at) FROM debts
  UNION SELECT tenant_id, date(created_at) FROM imports
),
returned AS (
  SELECT
    cohort.tenant_id,
    MAX(activity.day = date(cohort.anchor_at, '+1 day')) AS d1,
    MAX(activity.day = date(cohort.anchor_at, '+7 days')) AS d7,
    MAX(activity.day = date(cohort.anchor_at, '+30 days')) AS d30
  FROM cohort
  JOIN activity ON activity.tenant_id = cohort.tenant_id
  GROUP BY cohort.tenant_id
),
member AS (
  SELECT
    cohort.cohort,
    cohort.anchor_at <= datetime('now', '-1 day') AS activation_eligible,
    EXISTS (
      SELECT 1 FROM goal_events
      WHERE goal_events.tenant_id = cohort.tenant_id
        AND goal_events.name = 'first_action_completed'
        AND goal_events.created_at <= datetime(cohort.anchor_at, '+1 day')
    ) AS activated,
    date(cohort.anchor_at, '+1 day') < date('now') AS d1_eligible,
    date(cohort.anchor_at, '+7 days') < date('now') AS d7_eligible,
    date(cohort.anchor_at, '+30 days') < date('now') AS d30_eligible,
    COALESCE(returned.d1, 0) AS d1,
    COALESCE(returned.d7, 0) AS d7,
    COALESCE(returned.d30, 0) AS d30
  FROM cohort
  LEFT JOIN returned ON returned.tenant_id = cohort.tenant_id
  WHERE cohort.anchor_at IS NOT NULL
)
SELECT
  cohort,
  COUNT(*) AS signups,
  SUM(activation_eligible) AS activation_eligible,
  SUM(activation_eligible AND activated) AS activated_24h,
  ROUND(100.0 * SUM(activation_eligible AND activated) / NULLIF(SUM(activation_eligible), 0), 1)
    AS activation_rate_pct,
  SUM(d1_eligible) AS d1_eligible,
  SUM(d1_eligible AND d1) AS d1_returned,
  ROUND(100.0 * SUM(d1_eligible AND d1) / NULLIF(SUM(d1_eligible), 0), 1) AS d1_rate_pct,
  SUM(d7_eligible) AS d7_eligible,
  SUM(d7_eligible AND d7) AS d7_returned,
  ROUND(100.0 * SUM(d7_eligible AND d7) / NULLIF(SUM(d7_eligible), 0), 1) AS d7_rate_pct,
  SUM(d30_eligible) AS d30_eligible,
  SUM(d30_eligible AND d30) AS d30_returned,
  ROUND(100.0 * SUM(d30_eligible AND d30) / NULLIF(SUM(d30_eligible), 0), 1) AS d30_rate_pct
FROM member
GROUP BY cohort
ORDER BY signups DESC, cohort;
