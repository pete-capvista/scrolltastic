import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('authorization persistence migration', () => {
  const migration = readFileSync('db/migrations/0001_authorization_and_releases.sql', 'utf8');

  it('constrains account identity, story roles and release concurrency inventory', () => {
    expect(migration).toContain('unique (identity_provider, provider_subject)');
    expect(migration).toContain("role in ('viewer', 'editor', 'publisher', 'owner')");
    expect(migration).toContain('unique (story_id, etag)');
    expect(migration).toContain('foreign key (production_release_id) references production_releases(id)');
  });

  it('provides attributable releases and append-only audit storage', () => {
    expect(migration).toMatch(/production_releases[\s\S]*actor_id uuid not null references accounts/);
    expect(migration).toMatch(/audit_events[\s\S]*actor_id uuid references accounts/);
    expect(migration).not.toMatch(/on delete cascade/i);
  });
});

describe('story memory and maintenance migration', () => {
  const migration = readFileSync('db/migrations/0005_story_memory_operations.sql', 'utf8');

  it('keeps memory review, generation provenance, invalidation, leases and dead letters durable', () => {
    expect(migration).toContain("status in ('proposed', 'approved', 'rejected', 'invalidated')");
    expect(migration).toContain('primary key (generation_id, memory_id)');
    expect(migration).toContain('draft_workspace_revision_invalidates_memory');
    expect(migration).toContain('and derived and status');
    expect(migration).toContain('create table maintenance_leases');
    expect(migration).toContain('create table maintenance_failures');
  });
});

describe('working draft migration', () => {
  const migration = readFileSync('db/migrations/0007_working_drafts.sql', 'utf8');

  it('separates mutable workspace changes from accepted revisions', () => {
    expect(migration).toContain('working_document_json jsonb');
    expect(migration).toContain("working_operations_json jsonb not null default '[]'::jsonb");
    expect(migration).toContain('draft_workspaces_working_operations_array');
  });
});

describe('generated asset migration', () => {
  const migration = readFileSync('db/migrations/0008_generated_assets.sql', 'utf8');

  it('permits generated assets only with explicit AI provenance', () => {
    expect(migration).toContain('alter column upload_grant_id drop not null');
    expect(migration).toContain("provenance ->> 'kind' = 'ai-generated'");
  });
});
