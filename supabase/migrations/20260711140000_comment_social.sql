-- =============================================================================
-- Social sui COMMENTI dei post: cheers al commento, risposte (threading), @menzioni.
-- =============================================================================

-- 1) Cheers su un commento — specchio esatto della tabella `cheers` delle sessioni.
create table if not exists public.comment_cheers (
  id uuid default gen_random_uuid() primary key,
  comment_id uuid references public.comments(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default timezone('utc', now()) not null,
  unique (comment_id, user_id)   -- load-bearing: il toggle si affida al 23505
);
alter table public.comment_cheers enable row level security;
drop policy if exists "comment_cheers read"   on public.comment_cheers;
drop policy if exists "comment_cheers insert" on public.comment_cheers;
drop policy if exists "comment_cheers delete" on public.comment_cheers;
create policy "comment_cheers read"   on public.comment_cheers for select using (true);
create policy "comment_cheers insert" on public.comment_cheers for insert with check (auth.uid() = user_id);
create policy "comment_cheers delete" on public.comment_cheers for delete using (auth.uid() = user_id);
create index if not exists idx_comment_cheers_comment on public.comment_cheers (comment_id);

-- 2) Risposte ai commenti (threading a 1 livello): auto-riferimento a comments.
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists idx_comments_parent on public.comments (parent_id);

-- 3) Indice mancante su comments(session_id) (getComments filtra sempre di qui).
create index if not exists idx_comments_session on public.comments (session_id);
