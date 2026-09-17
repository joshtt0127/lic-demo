-- Fix: `insert ... returning` on `conversations` was refused.
--
-- Same snapshot issue as the casting-call policies: `conversations_read`
-- required membership, but the member rows are written on the next request, so
-- the row the INSERT returns had no member yet. The creator is a member by
-- intent — say so in the policy.

drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations
  for select to authenticated using (
    created_by = auth.uid() or public.is_conversation_member(id)
  );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (created_by = auth.uid() or public.is_conversation_member(id))
  with check (created_by = auth.uid() or public.is_conversation_member(id));
