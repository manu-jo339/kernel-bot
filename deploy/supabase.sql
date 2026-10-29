-- Kernel Bot — table qui garde la session WhatsApp (à exécuter UNE fois, dans Supabase > SQL Editor)
create table if not exists public.kernel_auth (
  session text not null,
  cle     text not null,
  valeur  text not null,
  maj     timestamptz not null default now(),
  primary key (session, cle)
);

-- Sécurité : personne ne peut lire la table avec la clé publique. Seule la clé « service_role » (secrète, côté serveur) y accède.
alter table public.kernel_auth enable row level security;
revoke all on public.kernel_auth from anon, authenticated;
