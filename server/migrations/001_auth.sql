create table if not exists organizations (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(trim(name)) between 2 and 120)
);

create table if not exists users (
  id bigint generated always as identity primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_full_name_length check (char_length(trim(full_name)) between 2 and 120),
  constraint users_email_length check (char_length(email) between 3 and 320)
);

create unique index if not exists users_email_lower_unique
  on users (lower(email));

create index if not exists users_organization_id_index
  on users (organization_id);

create table if not exists password_reset_tokens (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_index
  on password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_index
  on password_reset_tokens (expires_at);
