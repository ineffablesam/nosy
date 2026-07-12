-- Who is watching which thread (or channel)
-- thread_key format: "channelId:threadTs" for threads, "channel:channelId" for whole channels
create table if not exists subscriptions (
  id            uuid primary key default gen_random_uuid(),
  thread_key    text not null,
  user_id       text not null,
  subscribed_at timestamptz default now(),
  unique(thread_key, user_id)
);

-- Per-thread state: cooldown, activity tracking for obituary
create table if not exists thread_state (
  thread_key      text primary key,
  last_alerted_at timestamptz,
  last_message_at timestamptz,
  message_count   int default 0,
  obituary_sent   boolean default false,
  updated_at      timestamptz default now()
);

-- Nosy's long-term memory: one row per notable observation
create table if not exists observations (
  id          uuid primary key default gen_random_uuid(),
  thread_key  text not null,
  channel_id  text not null,
  people      text[] default '{}',
  observation text not null,
  created_at  timestamptz default now()
);

-- Receipts: commitments Nosy has detected and is tracking
create table if not exists receipts (
  id          uuid primary key default gen_random_uuid(),
  thread_key  text not null,
  channel_id  text not null,
  made_by     text not null,
  commitment  text not null,
  due_hint    text,
  resolved    boolean default false,
  alerted     boolean default false,
  snooze_until timestamptz,              -- set by the "Snooze 1 day" button
  created_at  timestamptz default now()
);

-- DM conversation history (user <-> Nosy)
create table if not exists dm_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  role       text not null,
  content    text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_observations_created   on observations(created_at desc);
create index if not exists idx_observations_channel   on observations(channel_id);
create index if not exists idx_receipts_thread        on receipts(thread_key);
create index if not exists idx_receipts_unresolved    on receipts(resolved, alerted, created_at);
create index if not exists idx_dm_messages_user       on dm_messages(user_id, created_at desc);
