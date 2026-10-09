create table conversations (
  id uuid primary key,
  workspace_id uuid not null references draft_workspaces(id),
  created_by uuid not null references accounts(id),
  status text not null check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_workspace_created_idx on conversations(workspace_id, created_at desc);

create table generations (
  id uuid primary key,
  workspace_id uuid not null references draft_workspaces(id),
  conversation_id uuid not null references conversations(id),
  account_id uuid not null references accounts(id),
  base_revision_id uuid not null references draft_revisions(id),
  model text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  prompt_digest text not null check (prompt_digest ~ '^[0-9a-f]{64}$'),
  context_digest text check (context_digest ~ '^[0-9a-f]{64}$'),
  input_json jsonb not null,
  output_json jsonb,
  usage_json jsonb,
  estimated_cost numeric(14, 8),
  actual_cost numeric(14, 8),
  latency_ms integer,
  resulting_revision_id uuid references draft_revisions(id),
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index generations_conversation_created_idx on generations(conversation_id, created_at, id);
create index generations_workspace_status_idx on generations(workspace_id, status);

create table messages (
  id uuid primary key,
  conversation_id uuid not null references conversations(id),
  sequence integer not null check (sequence >= 0),
  role text not null check (role in ('user', 'assistant')),
  parts_json jsonb not null,
  generation_id uuid references generations(id),
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence)
);

create table tool_calls (
  id uuid primary key,
  generation_id uuid not null references generations(id),
  sequence integer not null check (sequence >= 0),
  tool_name text not null,
  input_json jsonb not null,
  output_json jsonb,
  status text not null check (status in ('running', 'completed', 'failed')),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (generation_id, sequence)
);

create table usage_reservations (
  id uuid primary key,
  generation_id uuid not null unique references generations(id),
  organization_id uuid not null references organizations(id),
  reserved_units bigint not null check (reserved_units > 0),
  reserved_cost numeric(14, 8) not null check (reserved_cost >= 0),
  status text not null check (status in ('active', 'reconciled', 'released')),
  expires_at timestamptz not null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);

create table usage_ledger (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  account_id uuid not null references accounts(id),
  generation_id uuid not null references generations(id),
  kind text not null check (kind in ('model_tokens', 'model_cost')),
  units bigint not null check (units >= 0),
  cost numeric(14, 8) not null check (cost >= 0),
  period_key text not null,
  created_at timestamptz not null default now(),
  unique (generation_id, kind)
);

create index usage_ledger_organization_period_idx on usage_ledger(organization_id, period_key);
create index usage_reservations_active_idx on usage_reservations(organization_id, expires_at) where status = 'active';

create table idempotency_keys (
  principal_id uuid not null references accounts(id),
  scope text not null,
  key text not null,
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  response_json jsonb,
  status text not null check (status in ('pending', 'completed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (principal_id, scope, key)
);

create index idempotency_keys_expiry_idx on idempotency_keys(expires_at);

alter table draft_revisions add constraint draft_revisions_generation_fk
  foreign key (generation_id) references generations(id);
create unique index draft_revisions_generation_idx on draft_revisions(generation_id) where generation_id is not null;
