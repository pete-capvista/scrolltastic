alter table draft_workspaces
  add column working_document_json jsonb,
  add column working_manifest_json jsonb,
  add column working_document_digest text,
  add column working_validation_json jsonb,
  add column working_operations_json jsonb not null default '[]'::jsonb;

update draft_workspaces dw
set working_document_json = dr.document_json,
    working_manifest_json = dr.manifest_json,
    working_document_digest = dr.document_digest,
    working_validation_json = dr.validation_json
from draft_revisions dr
where dr.id = dw.current_revision_id;

alter table draft_workspaces
  alter column working_document_json set not null,
  alter column working_manifest_json set not null,
  alter column working_document_digest set not null,
  alter column working_validation_json set not null;

alter table draft_workspaces
  add constraint draft_workspaces_working_operations_array
  check (jsonb_typeof(working_operations_json) = 'array');
