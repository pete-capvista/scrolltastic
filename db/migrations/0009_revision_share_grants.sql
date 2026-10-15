create table revision_share_grants (
  id uuid primary key,
  story_id uuid not null references stories(id),
  workspace_id uuid not null references draft_workspaces(id),
  revision_id uuid not null references draft_revisions(id),
  base_release_id uuid not null references production_releases(id),
  created_by uuid not null references accounts(id),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index revision_share_grants_story_created_idx
  on revision_share_grants(story_id, created_at desc);
create index revision_share_grants_expiry_idx
  on revision_share_grants(expires_at) where status = 'active';
