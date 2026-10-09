create table upload_grants (
  id uuid primary key,
  workspace_id uuid not null references draft_workspaces(id),
  uploader_id uuid not null references accounts(id),
  logical_path text not null check (logical_path ~ '^(assets|cards)/[A-Za-z0-9_-]+\.(svg|png|jpg|jpeg|webp|avif)$'),
  storage_key text not null unique,
  expected_media_type text not null,
  maximum_bytes bigint not null check (maximum_bytes > 0),
  status text not null check (status in ('prepared', 'inspecting', 'completed', 'expired', 'rejected')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index upload_grants_workspace_created_idx on upload_grants(workspace_id, created_at desc);
create index upload_grants_expiry_idx on upload_grants(expires_at) where status = 'prepared';

create table assets (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references draft_workspaces(id),
  upload_grant_id uuid not null unique references upload_grants(id),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  media_type text not null,
  bytes bigint not null check (bytes > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  logical_path text not null,
  storage_key text not null unique,
  scan_status text not null check (scan_status in ('approved', 'rejected')),
  provenance jsonb not null,
  uploader_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (workspace_id, logical_path)
);

create index assets_workspace_created_idx on assets(workspace_id, created_at desc) where retired_at is null;

create table revision_assets (
  revision_id uuid not null references draft_revisions(id) on delete cascade,
  asset_id uuid not null references assets(id),
  logical_path text not null,
  primary key (revision_id, logical_path),
  unique (revision_id, asset_id)
);
