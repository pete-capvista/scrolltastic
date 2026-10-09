alter table assets alter column upload_grant_id drop not null;

alter table assets add constraint assets_upload_provenance
check (
  (upload_grant_id is not null and provenance ->> 'kind' = 'user-upload')
  or
  (upload_grant_id is null and provenance ->> 'kind' = 'ai-generated')
);
