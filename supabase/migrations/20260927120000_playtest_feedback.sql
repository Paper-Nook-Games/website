-- MINTHAVEN Playtest: geri bildirim, hata raporu ve anonim telemetri tablolari.
--
-- Guvenlik modeli:
--   * Yazan tek taraf Vercel sunucu fonksiyonlaridir (service_role; RLS'i bypass eder).
--   * Uc tabloda da RLS ACIK ve anon/authenticated icin HICBIR policy YOK.
--   * anon/authenticated rollerinden tum tablo yetkileri acikca geri alinir.
--   * Gizlilik: IP adresi, request header'lari, isim/email/SteamID tutan kolon YOK.
--   * Veriler Supabase Studio'dan okunur; status/developer_note elle guncellenir.

-- ---------------------------------------------------------------------------
-- playtest_feedback
-- ---------------------------------------------------------------------------
create table if not exists public.playtest_feedback (
  id                    uuid        primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  installation_id       text        not null check (char_length(installation_id) <= 64),
  session_id            text        not null check (char_length(session_id) <= 64),
  version               text        not null check (char_length(version) <= 64),
  profile               text        not null check (char_length(profile) <= 32),
  locale                text        not null check (char_length(locale) <= 16),
  day                   integer,
  weekday               text        check (char_length(weekday) <= 16),
  current_screen        text        check (char_length(current_screen) <= 64),
  active_quest          text        check (char_length(active_quest) <= 120),
  session_seconds       integer     check (session_seconds >= 0),
  resolution            text        check (char_length(resolution) <= 32),
  display_mode          text        check (char_length(display_mode) <= 32),
  rating                integer     not null check (rating between 1 and 5),
  enjoyed_most          text        not null default '' check (char_length(enjoyed_most) <= 3000),
  confusing             text        not null default '' check (char_length(confusing) <= 3000),
  understood_earn_money boolean,
  understood_open_packs boolean,
  understood_build_deck boolean,
  understood_duel       boolean,
  understood_fish       boolean,
  understood_farm       boolean,
  unknown_how_to        text        not null default '' check (char_length(unknown_how_to) <= 3000),
  would_wishlist        text        not null check (would_wishlist in ('yes', 'maybe', 'no')),
  anything_else         text        not null default '' check (char_length(anything_else) <= 3000),
  status                text        not null default 'new'
                                    check (status in ('new', 'reviewing', 'planned', 'fixed', 'wont_fix')),
  developer_note        text
);

create index if not exists playtest_feedback_version_idx
  on public.playtest_feedback (version);
create index if not exists playtest_feedback_installation_created_idx
  on public.playtest_feedback (installation_id, created_at desc);
create index if not exists playtest_feedback_session_idx
  on public.playtest_feedback (session_id);
create index if not exists playtest_feedback_created_at_idx
  on public.playtest_feedback (created_at desc);
create index if not exists playtest_feedback_status_idx
  on public.playtest_feedback (status);

-- ---------------------------------------------------------------------------
-- playtest_bug_reports
-- ---------------------------------------------------------------------------
create table if not exists public.playtest_bug_reports (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  installation_id    text        not null check (char_length(installation_id) <= 64),
  session_id         text        not null check (char_length(session_id) <= 64),
  version            text        not null check (char_length(version) <= 64),
  profile            text        not null check (char_length(profile) <= 32),
  locale             text        not null check (char_length(locale) <= 16),
  day                integer,
  weekday            text        check (char_length(weekday) <= 16),
  current_screen     text        check (char_length(current_screen) <= 64),
  active_quest       text        check (char_length(active_quest) <= 120),
  session_seconds    integer     check (session_seconds >= 0),
  resolution         text        check (char_length(resolution) <= 32),
  display_mode       text        check (char_length(display_mode) <= 32),
  title              text        not null check (char_length(title) between 1 and 120),
  what_happened      text        not null check (char_length(what_happened) between 1 and 3000),
  expected_behavior  text        not null default '' check (char_length(expected_behavior) <= 3000),
  steps_to_reproduce text        not null default '' check (char_length(steps_to_reproduce) <= 3000),
  recent_events      jsonb,
  recent_errors      jsonb,
  status             text        not null default 'new'
                                 check (status in ('new', 'reviewing', 'planned', 'fixed', 'wont_fix')),
  developer_note     text
);

create index if not exists playtest_bug_reports_version_idx
  on public.playtest_bug_reports (version);
create index if not exists playtest_bug_reports_installation_created_idx
  on public.playtest_bug_reports (installation_id, created_at desc);
create index if not exists playtest_bug_reports_session_idx
  on public.playtest_bug_reports (session_id);
create index if not exists playtest_bug_reports_created_at_idx
  on public.playtest_bug_reports (created_at desc);
create index if not exists playtest_bug_reports_status_idx
  on public.playtest_bug_reports (status);

-- ---------------------------------------------------------------------------
-- playtest_events
-- ---------------------------------------------------------------------------
create table if not exists public.playtest_events (
  id              bigint      generated always as identity primary key,
  created_at      timestamptz not null default now(),
  occurred_at     timestamptz not null,
  installation_id text        not null check (char_length(installation_id) <= 64),
  session_id      text        not null check (char_length(session_id) <= 64),
  version         text        not null check (char_length(version) <= 64),
  profile         text        not null check (char_length(profile) <= 32),
  locale          text        not null check (char_length(locale) <= 16),
  event_name      text        not null check (event_name ~ '^[a-z0-9_]{1,64}$'),
  play_day        integer,
  weekday         text        check (char_length(weekday) <= 16),
  current_screen  text        check (char_length(current_screen) <= 64),
  properties      jsonb       not null default '{}'::jsonb
                              check (jsonb_typeof(properties) = 'object')
);

create index if not exists playtest_events_version_idx
  on public.playtest_events (version);
create index if not exists playtest_events_installation_created_idx
  on public.playtest_events (installation_id, created_at desc);
create index if not exists playtest_events_session_idx
  on public.playtest_events (session_id);
create index if not exists playtest_events_event_name_idx
  on public.playtest_events (event_name);
create index if not exists playtest_events_created_at_idx
  on public.playtest_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Erisim: RLS acik, anon/authenticated icin policy yok, yetkiler geri alinir.
-- ---------------------------------------------------------------------------
alter table public.playtest_feedback    enable row level security;
alter table public.playtest_bug_reports enable row level security;
alter table public.playtest_events      enable row level security;

revoke all on table public.playtest_feedback    from anon, authenticated;
revoke all on table public.playtest_bug_reports from anon, authenticated;
revoke all on table public.playtest_events      from anon, authenticated;
revoke all on sequence public.playtest_events_id_seq from anon, authenticated;

-- Sunucu fonksiyonu yalniz INSERT (kayit) ve SELECT (rate limit sayimi) kullanir.
grant select, insert on table public.playtest_feedback    to service_role;
grant select, insert on table public.playtest_bug_reports to service_role;
grant select, insert on table public.playtest_events      to service_role;
grant usage on sequence public.playtest_events_id_seq to service_role;
