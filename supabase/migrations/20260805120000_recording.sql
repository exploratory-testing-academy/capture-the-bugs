-- Session recording for Capture the Bugs.
--
-- One append-only table, deliberately. The browser holds a publishable ("anon")
-- key, and the only privilege it is granted is INSERT: with no SELECT, UPDATE or
-- DELETE policy, a tester cannot read, alter or remove anyone's session —
-- including their own. That posture is only possible if nothing session-level is
-- ever mutated, so a session is a stream of events and everything about it is
-- derived in SQL. See session_summary at the bottom.
--
-- A session carries a random word-triple code and nothing else: no name, login
-- or cohort token. The code is shown on screen and the tester decides whether to
-- share it. The list of codes a browser has produced stays in that browser.
--
-- Apply with either:
--   supabase db push                     (CLI, after `supabase link`)
--   or paste into the SQL editor at app.supabase.com

create table if not exists public.events (
  id            bigint      generated always as identity primary key,
  session_code  text        not null,
  seq           integer     not null,
  at            timestamptz,                          -- the browser's clock
  received_at   timestamptz not null default now(),   -- ours, and trustworthy
  type          text        not null,
  payload       jsonb       not null default '{}'::jsonb,

  constraint events_code_shape check (session_code ~ '^[a-z]+-[a-z]+-[0-9]{4}$'),
  constraint events_seq_sane   check (seq >= 0),
  constraint events_type_known check (type in (
    'session_start', 'session_resume', 'input', 'finding',
    'evaluate', 'reset', 'restart'
  )),
  -- The client clips long values; this is the backstop, not the mechanism.
  constraint events_payload_size check (octet_length(payload::text) <= 100000)
);

create index if not exists events_session_seq_idx on public.events (session_code, seq);
create index if not exists events_received_idx    on public.events (received_at desc);

alter table public.events enable row level security;

-- Insert, and pointedly nothing else. Reads happen as the service role or
-- through the SQL editor, never from the page.
drop policy if exists "anon appends events" on public.events;
create policy "anon appends events"
  on public.events for insert to anon, authenticated
  with check (true);

revoke all on public.events from anon, authenticated;
grant insert on public.events to anon, authenticated;

-- ── Derived session view ─────────────────────────────────────────────────────
-- The session row we chose not to store. security_invoker keeps the view from
-- handing out rows the caller's own policies would deny.
create or replace view public.session_summary
  with (security_invoker = on) as
select
  e.session_code,
  max(e.payload ->> 'target_id')  filter (where e.type = 'session_start') as target_id,
  min(e.received_at)                                                     as first_seen,
  max(e.received_at)                                                     as last_seen,
  -- Wall-clock, so it counts coffee breaks. Active time needs the gaps between
  -- consecutive events capped, which is a question per analysis, not a column.
  max(e.received_at) - min(e.received_at)                                as elapsed,
  count(*) filter (where e.type = 'input')                               as inputs,
  count(*) filter (where e.type = 'input'
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
  max(e.payload ->> 'hint_level')
    filter (where e.type in ('session_start', 'evaluate'))               as hint_level
from public.events e
group by e.session_code;

revoke all on public.session_summary from anon, authenticated;
