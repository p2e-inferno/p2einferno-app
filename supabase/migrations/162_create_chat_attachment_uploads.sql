create table if not exists public.chat_attachment_uploads (
  pathname text primary key,
  owner_identity_key text not null,
  privy_user_id text,
  anonymous_session_id text,
  source_ip text,
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_attachment_uploads_owner_identity_key_idx
  on public.chat_attachment_uploads (owner_identity_key, created_at desc);

create index if not exists chat_attachment_uploads_privy_user_id_idx
  on public.chat_attachment_uploads (privy_user_id, created_at desc)
  where privy_user_id is not null;

create index if not exists chat_attachment_uploads_anonymous_session_id_idx
  on public.chat_attachment_uploads (anonymous_session_id, created_at desc)
  where anonymous_session_id is not null;

drop trigger if exists update_chat_attachment_uploads_updated_at on public.chat_attachment_uploads;
create trigger update_chat_attachment_uploads_updated_at
before update on public.chat_attachment_uploads
for each row execute function public.update_updated_at_column();

alter table public.chat_attachment_uploads enable row level security;
