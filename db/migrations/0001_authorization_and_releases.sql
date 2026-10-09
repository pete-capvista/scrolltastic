create table accounts (
  id uuid primary key,
  identity_provider text not null,
  provider_subject text not null,
  display_name text,
  status text not null check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  unique (identity_provider, provider_subject)
);

create table organizations (
  id uuid primary key,
  name text not null,
  status text not null check (status in ('active', 'suspended', 'deleted')),
  plan_id text not null default 'initial',
  created_at timestamptz not null default now()
);

create table organization_memberships (
  organization_id uuid not null references organizations(id),
  account_id uuid not null references accounts(id),
  role text not null check (role in ('member', 'owner')),
  created_at timestamptz not null default now(),
  primary key (organization_id, account_id)
);

create table stories (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  production_release_id uuid,
  production_etag text,
  status text not null check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table story_memberships (
  story_id uuid not null references stories(id),
  account_id uuid not null references accounts(id),
  role text not null check (role in ('viewer', 'editor', 'publisher', 'owner')),
  created_at timestamptz not null default now(),
  primary key (story_id, account_id)
);

create table production_releases (
  id uuid primary key,
  story_id uuid not null references stories(id),
  parent_id uuid references production_releases(id),
  etag text not null,
  manifest_json jsonb not null,
  document_digest text not null check (document_digest ~ '^[0-9a-f]{64}$'),
  storage_prefix text not null,
  actor_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  unique (story_id, etag)
);

alter table stories add constraint stories_production_release_fk
  foreign key (production_release_id) references production_releases(id);

create table audit_events (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  actor_id uuid references accounts(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  request_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index story_memberships_account_idx on story_memberships(account_id, story_id);
create index production_releases_story_created_idx on production_releases(story_id, created_at desc);
create index audit_events_organization_created_idx on audit_events(organization_id, created_at desc);
