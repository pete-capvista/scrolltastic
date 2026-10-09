create table draft_workspaces (
  id uuid primary key,
  story_id uuid not null references stories(id),
  base_release_id uuid not null references production_releases(id),
  base_etag text not null,
  owner_id uuid not null references accounts(id),
  current_revision_id uuid,
  preview_acknowledged_revision_id uuid,
  status text not null check (status in ('active', 'committed', 'closed', 'conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table draft_revisions (
  id uuid primary key,
  workspace_id uuid not null references draft_workspaces(id),
  parent_id uuid references draft_revisions(id),
  generation_id uuid,
  document_json jsonb not null,
  manifest_json jsonb not null,
  document_digest text not null check (document_digest ~ '^[0-9a-f]{64}$'),
  validation_json jsonb not null,
  operations_json jsonb,
  created_by uuid not null references accounts(id),
  created_at timestamptz not null default now()
);

alter table draft_workspaces add constraint draft_workspaces_current_revision_fk
  foreign key (current_revision_id) references draft_revisions(id);
alter table draft_workspaces add constraint draft_workspaces_preview_revision_fk
  foreign key (preview_acknowledged_revision_id) references draft_revisions(id);

create unique index draft_workspaces_active_owner_story_idx
  on draft_workspaces(story_id, owner_id) where status = 'active';
create index draft_revisions_workspace_created_idx on draft_revisions(workspace_id, created_at desc);

create table commit_attempts (
  id uuid primary key,
  workspace_id uuid not null references draft_workspaces(id),
  revision_id uuid not null references draft_revisions(id),
  actor_id uuid not null references accounts(id),
  expected_etag text not null,
  status text not null check (status in ('pending', 'promoted', 'conflict', 'failed', 'reconciliation_required')),
  release_id uuid,
  resulting_etag text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index commit_attempts_workspace_created_idx on commit_attempts(workspace_id, created_at desc);
