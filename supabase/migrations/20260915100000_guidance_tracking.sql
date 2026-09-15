-- Track use of the "User stories" and "Test strategy" guidance buttons added
-- under Hints. Neither changes anything about the app under test — they are
-- reference material a tester can choose to open. Recording whether one was
-- opened lets the stats page ask the same question it already asks of
-- hint_level: did reaching for this material correlate with a better result,
-- keeping in mind testers choose to open it rather than being assigned to.
--
-- Apply with either:
--   supabase db push                     (CLI, after `supabase link`)
--   or paste into the SQL editor at app.supabase.com

alter table public.events drop constraint events_type_known;
alter table public.events add constraint events_type_known check (type in (
  'session_start', 'session_resume', 'input', 'finding',
  'evaluate', 'reset', 'restart', 'guidance'
));

-- Rebuilt in full: create or replace view can append columns at the end of
-- the select list, but the whole query has to be restated to do it.
create or replace view public.session_summary_public
  with (security_invoker = off) as
select
  e.session_code,
  max(e.payload ->> 'target_id')  filter (where e.type = 'session_start') as target_id,
  min(e.received_at)                                                     as first_seen,
  max(e.received_at)                                                     as last_seen,
  max(e.received_at) - min(e.received_at)                                as elapsed,
  count(distinct e.payload ->> 'index') filter (where e.type = 'input')  as inputs,
  count(*)                              filter (where e.type = 'input')  as input_events,
  count(distinct e.payload ->> 'index') filter (where e.type = 'input'
                     and (e.payload ->> 'committed')::boolean)           as submitted_inputs,
  count(distinct e.payload ->> 'index') filter (where e.type = 'finding') as findings,
  count(*) filter (where e.type = 'evaluate')                            as evaluations,
  count(*) filter (where e.type = 'reset')                               as resets,
  count(*) filter (where e.type = 'session_resume')                      as resumes,
  bool_or(e.type = 'evaluate')                                           as submitted,
  bool_or(e.type = 'restart')                                            as restarted,
  max((e.payload ->> 'matched_count')::numeric)
    filter (where e.type = 'evaluate')                                   as best_matched,
  max((e.payload ->> 'earned_points')::numeric)
    filter (where e.type = 'evaluate')                                   as best_points,
  max((e.payload ->> 'coverage_percent')::numeric)
    filter (where e.type = 'evaluate')                                   as coverage_percent,
  min(e.payload ->> 'hint_level') filter (where e.type = 'session_start')  as hint_level,
  -- Whether the session ever opened each guidance panel, not how many times.
  bool_or(e.type = 'guidance' and e.payload ->> 'kind' = 'stories')      as used_user_stories,
  bool_or(e.type = 'guidance' and e.payload ->> 'kind' = 'strategy')     as used_test_strategy
from public.events_public e
group by e.session_code;

comment on view public.session_summary_public is
  'Per-session rollup for the public stats page. Corrects the input counting '
  'and hint_level aggregation in public.session_summary, and adds whether the '
  'user-stories/test-strategy guidance panels were opened.';
