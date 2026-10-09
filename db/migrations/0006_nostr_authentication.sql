create table authentication_challenges (
  id uuid primary key,
  provider text not null check (provider in ('nostr')),
  challenge_digest text not null check (challenge_digest ~ '^[0-9a-f]{64}$'),
  client_fingerprint text not null check (client_fingerprint ~ '^[0-9a-f]{64}$'),
  return_path text not null default '/',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index authentication_challenges_active_digest_idx
  on authentication_challenges(challenge_digest) where consumed_at is null;
create index authentication_challenges_rate_idx
  on authentication_challenges(client_fingerprint, created_at desc);
create index authentication_challenges_expiry_idx
  on authentication_challenges(expires_at) where consumed_at is null;
