create table story_memory (
  id uuid primary key,
  story_id uuid not null references stories(id),
  category text not null check (category in ('canon', 'style', 'arc', 'derived')),
  value_json jsonb not null,
  provenance_json jsonb not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  status text not null check (status in ('proposed', 'approved', 'rejected', 'invalidated')),
  scope_json jsonb not null default '[]'::jsonb,
  source_revision_id uuid references draft_revisions(id),
  derived boolean not null default false,
  created_by uuid not null references accounts(id),
  reviewed_by uuid references accounts(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  invalidated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index story_memory_review_idx on story_memory(story_id, status, created_at desc);
create index story_memory_source_idx on story_memory(source_revision_id) where derived and status in ('proposed', 'approved');

create table generation_memory (
  generation_id uuid not null references generations(id),
  memory_id uuid not null references story_memory(id),
  supplied_at timestamptz not null default now(),
  primary key (generation_id, memory_id)
);

create table maintenance_leases (
  name text primary key,
  holder text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table maintenance_failures (
  id uuid primary key,
  job_name text not null,
  item_type text not null,
  item_id text not null,
  error_code text not null,
  attempts integer not null default 1 check (attempts > 0),
  details_json jsonb not null default '{}'::jsonb,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (job_name, item_type, item_id)
);

create index maintenance_failures_open_idx on maintenance_failures(job_name, last_failed_at desc) where resolved_at is null;

create function invalidate_revision_derived_memory() returns trigger language plpgsql as $$
begin
  if old.current_revision_id is distinct from new.current_revision_id and old.current_revision_id is not null then
    update story_memory
      set status = 'invalidated', invalidated_at = now(), updated_at = now()
      where story_id = new.story_id and source_revision_id = old.current_revision_id
        and derived and status in ('proposed', 'approved');
  end if;
  return new;
end;
$$;

create trigger draft_workspace_revision_invalidates_memory
after update of current_revision_id on draft_workspaces
for each row execute function invalidate_revision_derived_memory();
