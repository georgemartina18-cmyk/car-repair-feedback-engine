-- =============================================================================
-- DANGER: removes every table and function of the Feedback Engine (and ALL data
-- in them). Use it to clear a half-finished or conflicting install, then run
-- 001_schema.sql, 002_functions.sql and 003_settings.sql again.
-- It only touches objects with the engine's table names / rfe_ function prefix.
-- =============================================================================
DROP TABLE IF EXISTS
  outbox, ready_to_post, response_drafts, case_events, cases, feedback_messages,
  feedback, feedback_requests, jobs, customers, staff_contacts, branches, regions,
  unmatched_inbound, app_settings
CASCADE;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = current_schema() AND p.proname LIKE 'rfe\_%' LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.sig || ' CASCADE';
  END LOOP;
END $$;
