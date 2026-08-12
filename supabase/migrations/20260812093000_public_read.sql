-- Public read access for the stats page.
--
-- The recording migration granted anon INSERT and nothing else, which left the
-- data write-only: nobody could read it back without the service role, so a
-- year of sessions could accumulate and never be looked at. This opens it up
-- deliberately. The exercise data is treated as public — findings, inputs,
-- scores and timings are all readable by anyone with the publishable key, which
-- is to say by anyone at all, since that key ships in every tester's browser.
--
-- Read goes through views rather than a grant on public.events, for one reason:
-- a view is where the redaction below can be enforced. Granting select on the
-- base table would let anyone bypass it by querying events directly.
--
-- What stays hidden is the browser fingerprint recorded on session_start —
-- user_agent, language, tz_offset_minutes, viewport. Those four together
-- identify a browser quite precisely, and next to free-prose findings they
-- narrow to a person considerably faster than either does alone. Nothing on the
-- stats page reads them, so they are dropped at the read boundary instead of
-- being published and ignored. They remain in the base table for the service
-- role.
--
-- Apply with either:
--   supabase db push                     (CLI, after `supabase link`)
--   or paste into the SQL editor at app.supabase.com

-- security_invoker = off is the whole mechanism: the view executes as its owner
-- and so may read public.events, while anon still may not. The base table's
-- grants are deliberately left exactly as the recording migration set them.
create or replace view public.events_public
  with (security_invoker = off) as
-- distinct on collapses duplicate delivery. A POST whose response is lost is
-- re-queued and re-sent (js/record.js), so the same (session_code, seq) can
-- legitimately land twice; counting it twice would inflate every statistic.
select distinct on (e.session_code, e.seq)
  e.session_code,
  e.seq,
  e.at,
  e.received_at,
  e.type,
  e.payload - array['user_agent', 'language', 'tz_offset_minutes', 'viewport']
    as payload
from public.events e
order by e.session_code, e.seq, e.id;

comment on view public.events_public is
  'Session events with the browser fingerprint stripped and duplicate '
  'deliveries collapsed. Readable by anon; public.events is not.';

-- ── Derived session view ─────────────────────────────────────────────────────
-- Mirrors public.session_summary, but built on events_public so it inherits the
-- dedupe, and with three counting fixes that the original got wrong. Kept as a
-- separate view rather than altering session_summary, because that one is what
-- service-role analysis already queries and its numbers should not shift under
-- anyone mid-analysis.
create or replace view public.session_summary_public
  with (security_invoker = off) as
select
  e.session_code,
  max(e.payload ->> 'target_id')  filter (where e.type = 'session_start') as target_id,
  min(e.received_at)                                                     as first_seen,
  max(e.received_at)                                                     as last_seen,
  -- Wall-clock, so it counts coffee breaks. Active time needs the gaps between
  -- consecutive events capped, which is a question per analysis, not a column.
  max(e.received_at) - min(e.received_at)                                as elapsed,
  -- Fix 1: the original counted input *events*. An input is re-emitted every
  -- time its value changes, so a tester editing one field twenty times read as
  -- twenty inputs. Count distinct positions, and keep the raw event count
  -- alongside it — churn per field is interesting on its own.
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
  -- Fix 2: the original took max() over hint_level as text, which sorts
  -- lexicographically — 'off' > 'detail' > 'count' > 'all' — so it reported the
  -- alphabetically last level rather than the one in effect. A session has
  -- exactly one session_start, so reading it from there is unambiguous. Null
  -- for a session whose start event never landed.
  min(e.payload ->> 'hint_level') filter (where e.type = 'session_start')  as hint_level
from public.events_public e
group by e.session_code;

comment on view public.session_summary_public is
  'Per-session rollup for the public stats page. Corrects the input counting '
  'and hint_level aggregation in public.session_summary.';

grant select on public.events_public         to anon, authenticated;
grant select on public.session_summary_public to anon, authenticated;
