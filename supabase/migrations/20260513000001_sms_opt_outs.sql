-- SMS opt-out registry — TCPA / A2P 10DLC compliance.
--
-- Every outbound SMS must check this table FIRST. Inbound STOP / UNSUBSCRIBE
-- / END / QUIT / CANCEL / STOPALL keywords land via the Twilio inbound webhook
-- and insert a row here. Send-side code in api/services/smsService.js
-- (isOptedOut) blocks future sends to that phone.
--
-- We store the E.164 phone, the keyword that opted them out (audit trail),
-- the timestamp, and an optional source for debugging. STARTed / re-opted-in
-- phones are removed by row delete, not soft-flag, so the absence of a row
-- is the source of truth ("can text").

create table if not exists public.sms_opt_outs (
  phone        text primary key,
  keyword      text,
  source       text default 'inbound_webhook',
  opted_out_at timestamptz not null default now(),
  notes        text
);

comment on table  public.sms_opt_outs is 'TCPA/A2P opt-out registry. Send code MUST query this before every outbound SMS.';
comment on column public.sms_opt_outs.phone   is 'E.164 phone number, e.g. +14801234567';
comment on column public.sms_opt_outs.keyword is 'Keyword the customer sent that triggered opt-out (STOP, UNSUBSCRIBE, ...). Audit trail.';

-- RLS: nobody reads directly from the client. All access is server-side via
-- the service-role key. Lock the table down.
alter table public.sms_opt_outs enable row level security;

-- (no policies created → only the service role can read/write)

-- Inbound SMS log — every inbound message is recorded for the future unified
-- per-customer comms timeline (Thryv-style inbox). Keeping it append-only.
create table if not exists public.sms_inbound (
  id            uuid primary key default gen_random_uuid (),
  twilio_sid    text unique,
  from_phone    text not null,
  to_phone      text,
  body          text,
  received_at   timestamptz not null default now(),
  matched_optout_keyword text,
  raw           jsonb
);

create index if not exists sms_inbound_from_phone_received_idx
  on public.sms_inbound (from_phone, received_at desc);

alter table public.sms_inbound enable row level security;
