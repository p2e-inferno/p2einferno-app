create table if not exists public.chat_conversations (
  id text primary key,
  privy_user_id text not null,
  source text not null check (source in ('anonymous', 'authenticated')),
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id text primary key,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_widget_sessions (
  privy_user_id text primary key,
  active_conversation_id text references public.chat_conversations(id) on delete set null,
  is_open boolean not null default false,
  is_peek_visible boolean not null default false,
  is_peek_dismissed boolean not null default false,
  draft text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_privy_user_id_idx
  on public.chat_conversations (privy_user_id, updated_at desc);

create index if not exists chat_conversations_active_idx
  on public.chat_conversations (privy_user_id, updated_at desc)
  where cleared_at is null;

create index if not exists chat_messages_conversation_id_idx
  on public.chat_messages (conversation_id, sent_at asc);

drop trigger if exists update_chat_conversations_updated_at on public.chat_conversations;
create trigger update_chat_conversations_updated_at
before update on public.chat_conversations
for each row execute function public.update_updated_at_column();

drop trigger if exists update_chat_widget_sessions_updated_at on public.chat_widget_sessions;
create trigger update_chat_widget_sessions_updated_at
before update on public.chat_widget_sessions
for each row execute function public.update_updated_at_column();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_widget_sessions enable row level security;
