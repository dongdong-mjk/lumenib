-- lumenib 테스터 노트 보관용 Supabase 설정
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run 을 한 번 눌러요.
-- 여러 번 실행해도 괜찮게 만들었어요.

-- 1) 노트 목록 (제목·날짜·본문 같은 가벼운 정보만. 손글씨는 아래 파일 저장소에)
create table if not exists public.notes (
  id          text        not null,
  user_id     uuid        not null references auth.users (id) on delete cascade default auth.uid(),
  title       text        not null default '',
  preacher    text        not null default '',
  note_date   date,
  passages    jsonb       not null default '[]'::jsonb,
  done        boolean     not null default false,
  deleted     boolean     not null default false,
  file_bytes  integer     not null default 0,   -- 압축한 손글씨 파일 크기 (1인 용량 안전장치에 씀)
  updated_ms  bigint      not null default 0,   -- 앱에서 마지막으로 고친 시각 (밀리초)
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- 2) 보관 동의 기록 (언제, 어떤 안내문에 동의했는지)
create table if not exists public.consents (
  user_id    uuid        primary key references auth.users (id) on delete cascade default auth.uid(),
  version    text        not null,
  agreed_at  timestamptz not null default now()
);

-- 로그인한 사용자만 API로 쓸 수 있게 (프로젝트의 '자동 권한' 설정과 상관없이 같게 맞춰요)
revoke all on public.notes, public.consents from anon;
grant select, insert, update, delete on public.notes, public.consents to authenticated;

-- 3) 자기 것만 읽고 쓰기 (Row Level Security)
alter table public.notes    enable row level security;
alter table public.consents enable row level security;

drop policy if exists "notes: own rows" on public.notes;
create policy "notes: own rows" on public.notes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "consents: own row" on public.consents;
create policy "consents: own row" on public.consents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4) 손글씨 파일 저장소: 비공개 버킷 'ink', 파일 하나 최대 5MB, 경로 = <사용자id>/<노트id>.json.gz
insert into storage.buckets (id, name, public, file_size_limit)
values ('ink', 'ink', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists "ink: own folder read"   on storage.objects;
drop policy if exists "ink: own folder insert" on storage.objects;
drop policy if exists "ink: own folder update" on storage.objects;
drop policy if exists "ink: own folder delete" on storage.objects;
create policy "ink: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'ink' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "ink: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'ink' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "ink: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'ink' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "ink: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ink' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 5) 1인 용량 안전장치: 손글씨 합계 500MB 넘으면 더 올리지 않음
create or replace function public.notes_quota_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select coalesce(sum(file_bytes), 0) from public.notes
        where user_id = new.user_id and id <> new.id) + new.file_bytes > 500 * 1024 * 1024 then
    raise exception 'quota_exceeded';
  end if;
  return new;
end $$;
drop trigger if exists notes_quota on public.notes;
create trigger notes_quota before insert or update on public.notes
  for each row execute function public.notes_quota_check();

-- 6) 탈퇴: 앱에서 손글씨 파일을 먼저 지운 뒤 이 함수를 불러 계정·노트 목록·동의 기록을 지워요
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 7) 민정님이 보는 용도: 테스터별 노트 수·용량 (Table Editor 에서 views 로 확인)
create or replace view public.tester_usage with (security_invoker = true) as
  select user_id, count(*) filter (where not deleted) as notes,
         round(sum(file_bytes) / 1024.0 / 1024.0, 2) as mb, max(created_at) as last_note
  from public.notes group by user_id;
revoke all on public.tester_usage from anon;
