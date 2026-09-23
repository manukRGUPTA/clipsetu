import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(new URL("../supabase/migrations/20260923090000_clipsetu_auth_core.sql", import.meta.url), "utf8");
const hardening = fs.readFileSync(new URL("../supabase/migrations/20260923093000_clipsetu_policy_hardening.sql", import.meta.url), "utf8");
const workflows = fs.readFileSync(new URL("../supabase/migrations/20260923100000_campaign_submission_flows.sql", import.meta.url), "utf8");
const workflowAccess = fs.readFileSync(new URL("../supabase/migrations/20260923101000_campaign_submission_access.sql", import.meta.url), "utf8");

test("the first migration is additive and contains no destructive schema operations", () => {
  assert.doesNotMatch(sql, /\bdrop\s+(table|schema|database|type|trigger)\b/i);
  assert.doesNotMatch(sql, /\btruncate\s+table\b/i);
  assert.match(sql, /create table public\.profiles/i);
});

test("every public application table enables row-level security", () => {
  const tables = [...sql.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]);
  assert.ok(tables.length >= 15, `expected a broad application schema, found ${tables.length} tables`);
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
  }
});

test("public signup cannot create or activate an admin role", () => {
  const trigger = sql.match(/create or replace function private\.handle_new_auth_user\(\)([\s\S]*?)\$\$;/i)?.[1] ?? "";
  assert.match(trigger, /when 'business' then 'business'::public\.user_role/i);
  assert.match(trigger, /else 'clipper'::public\.user_role/i);
  assert.match(trigger, /values \(new\.id, requested_role, 'pending'\)/i);
  assert.doesNotMatch(trigger, /'admin'::public\.user_role/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|all)\s+on\s+public\.user_roles\s+to\s+authenticated/i);
});

test("admin checks require active role and second-factor assurance", () => {
  assert.match(sql, /function private\.is_admin\(\)[\s\S]*?auth\.jwt\(\)\s*->>\s*'aal'[\s\S]*?=\s*'aal2'/i);
  assert.match(sql, /mfa_totp_enroll_enabled|admin MFA session required|Admin MFA session required/i);
  for (const rpc of ["admin_set_user_role", "admin_review_business", "admin_review_campaign", "admin_review_submission", "admin_review_view_report"]) {
    const body = sql.match(new RegExp(`function public\\.${rpc}\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /private\.is_admin\(\)/i, `${rpc} must be guarded by the MFA-aware admin check`);
  }
});

test("financial and view records are server-reviewed and paise/cumulative based", () => {
  assert.match(sql, /amount_paise bigint/);
  assert.match(sql, /reported_cumulative_views bigint/);
  assert.match(sql, /approved_cumulative_views bigint/);
  assert.match(sql, /private\.payout_destinations/);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+public\.(earnings_ledger|payout_requests|payout_receipts)\s+to\s+authenticated/i);
  assert.match(sql, /public\.earnings_ledger[\s\S]*?client insert\/update\/delete is intentionally denied/i);
});

test("the local env template contains placeholders only, never backend secrets", () => {
  const env = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(env, /NEXT_PUBLIC_SUPABASE_URL=https:\/\/YOUR_PROJECT_REF/);
  assert.match(env, /NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY/);
  assert.doesNotMatch(env, /service_role|SUPABASE_DB_PASSWORD|sb_secret_|sk_live_/i);
});

test("campaign participation is constrained by join mode and submissions use the matching campaign", () => {
  assert.match(hardening, /campaign_participants\.status = 'active' and c\.join_mode = 'open'/i);
  assert.match(hardening, /campaign_participants\.status = 'requested' and c\.join_mode = 'approval'/i);
  assert.match(hardening, /p\.campaign_id = submissions\.campaign_id/i);
  assert.doesNotMatch(hardening, /p\.campaign_id\s*=\s*p\.campaign_id/i);
});

test("only an MFA admin can upload receipts for an existing paid payout, and negative decisions need reasons", () => {
  assert.match(hardening, /payout_receipt_upload_admin_paid_request[\s\S]*?private\.is_admin\(\)[\s\S]*?r\.status = 'paid'/i);
  assert.match(hardening, /admin_review_business[\s\S]*?p_decision in \('rejected', 'suspended'\)[\s\S]*?coalesce\(trim\(p_reason\), ''\) = ''/i);
  assert.match(hardening, /admin_set_user_role[\s\S]*?p_status in \('rejected', 'suspended'\)[\s\S]*?coalesce\(trim\(p_reason\), ''\) = ''/i);
});

test("campaign and submission workflow migration is additive and preserves terms history", () => {
  assert.doesNotMatch(workflows, /\bdrop\s+(table|schema|database|type|trigger)\b/i);
  assert.doesNotMatch(workflows, /\btruncate\s+table\b/i);
  assert.match(workflows, /public\.save_campaign_draft\([\s\S]*?security definer[\s\S]*?private\.has_role\('business', 'active'\)/i);
  assert.match(workflows, /insert into public\.campaign_terms[\s\S]*?max\(t\.version\), 0\) \+ 1/i);
  assert.match(workflows, /'terms_version', coalesce\(v_version, 1\)[\s\S]*?'terms', coalesce\(v_terms/i);
  assert.match(workflows, /public\.join_campaign\([\s\S]*?private\.has_role\('clipper', 'active'\)[\s\S]*?c\.join_mode = 'open'/i);
  assert.match(workflows, /public\.business_decide_participation\([\s\S]*?b\.owner_id = auth\.uid\(\)[\s\S]*?status = 'requested'/i);
  assert.match(workflows, /public\.submit_clip\([\s\S]*?private\.has_role\('clipper', 'active'\)[\s\S]*?campaign_participants[\s\S]*?status = 'active'/i);
  assert.match(workflows, /revoke insert \(campaign_id, clipper_id, source_url, published_url, platform, published_at, notes\) on public\.submissions from authenticated/i);
  assert.match(workflows, /revoke insert \(campaign_id, version, terms, created_by\) on public\.campaign_terms from authenticated/i);
  assert.match(workflows, /profiles_read_campaign_participants/);
  assert.match(workflows, /submission_reviews_read_involved/);
  assert.match(workflowAccess, /grant execute on function public\.submit_clip\([\s\S]*?to authenticated/i);
  assert.match(workflowAccess, /revoke insert \(campaign_id, clipper_id, source_url, published_url, platform, published_at, notes\) on public\.submissions from authenticated/i);
  assert.match(workflowAccess, /published_campaign_business_directory[\s\S]*?select distinct b\.id, b\.company_name/i);
  assert.doesNotMatch(workflowAccess, /\bdrop\s+(table|schema|database|type|trigger)\b/i);
});
