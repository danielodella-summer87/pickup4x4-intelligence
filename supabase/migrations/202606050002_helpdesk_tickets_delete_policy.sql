-- Permite eliminar tickets desde la mesa de ayuda (prototipo sin auth).
-- Ejecutar manualmente en el SQL Editor de Supabase si la eliminación falla por RLS.

drop policy if exists helpdesk_tickets_anon_delete on public.helpdesk_tickets;

create policy helpdesk_tickets_anon_delete
  on public.helpdesk_tickets
  for delete
  to anon, authenticated
  using (true);

grant delete on public.helpdesk_tickets to anon, authenticated;
