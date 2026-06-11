-- 0021_task_bug_flag.sql — тип задачи «баг» (v0.1.164, запрос DB).
-- Булев флаг на tasks: пометить задачу как баг, фильтровать (вкл/выкл) и
-- включать/исключать баги при экспорте. Частичный индекс для быстрого
-- выбора багов.
alter table public.tasks add column if not exists bug boolean not null default false;
create index if not exists tasks_bug_idx on public.tasks(bug) where bug = true;
