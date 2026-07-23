create table if not exists subscriptions (
  id serial primary key,
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_device_id_idx on subscriptions (device_id);

create table if not exists schedule (
  device_id text primary key,
  pet_nome text,
  agenda_items jsonb not null default '[]',
  recorrentes jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists sent_log (
  device_id text not null,
  notif_key text not null,
  sent_at timestamptz not null default now(),
  primary key (device_id, notif_key)
);
