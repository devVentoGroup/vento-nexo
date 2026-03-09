begin;

drop trigger if exists app_content_blocks_set_updated_at on public.app_content_blocks;
create trigger app_content_blocks_set_updated_at
before update on public.app_content_blocks
for each row execute function public.update_updated_at();

commit;
