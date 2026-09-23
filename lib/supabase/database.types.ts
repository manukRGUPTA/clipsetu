export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        { id: string; full_name: string; preferred_language: string; created_at: string; updated_at: string },
        { id: string; full_name?: string; preferred_language?: string }
      >;
      user_roles: Table<
        { user_id: string; role: "business" | "clipper" | "admin"; status: "pending" | "active" | "rejected" | "suspended"; created_at: string; decided_at: string | null },
        { user_id: string; role: "business" | "clipper" | "admin"; status?: "pending" | "active" | "rejected" | "suspended" }
      >;
      businesses: Table<
        { id: string; owner_id: string; company_name: string; contact_name: string; website_url: string | null; contact_email: string | null; status: "pending" | "approved" | "rejected" | "suspended"; decision_reason: string | null; created_at: string; updated_at: string },
        { owner_id: string; company_name: string; contact_name?: string; website_url?: string | null; contact_email?: string | null }
      >;
      clipper_profiles: Table<
        { user_id: string; languages: string[]; niches: string[]; portfolio_url: string | null; social_links: Json; onboarding_status: "pending" | "active" | "rejected" | "suspended"; created_at: string; updated_at: string },
        { user_id: string; languages?: string[]; niches?: string[]; portfolio_url?: string | null; social_links?: Json; onboarding_status?: "pending" | "active" | "rejected" | "suspended" }
      >;
      campaigns: Table<
        { id: string; business_id: string; created_by: string; title: string; description: string; source_url: string | null; source_rights_confirmed: boolean; languages: string[]; platforms: string[]; starts_at: string | null; ends_at: string | null; budget_paise: number; funded_budget_paise: number; base_reward_paise: number; join_mode: "open" | "approval"; bonus_rules: Json; bonus_scope: "per_clip" | "per_clipper" | "per_campaign" | null; bonus_stacking: "cumulative" | "highest_only" | null; status: "draft" | "pending_approval" | "published" | "paused" | "completed" | "cancelled" | "changes_requested" | "rejected"; status_reason: string | null; created_at: string; updated_at: string },
        { business_id: string; created_by: string; title: string; description?: string; budget_paise?: number; base_reward_paise?: number }
      >;
      campaign_terms: Table<
        { id: string; campaign_id: string; version: number; terms: Json; created_by: string; created_at: string },
        { campaign_id: string; version: number; terms: Json; created_by: string }
      >;
      campaign_participants: Table<
        { campaign_id: string; clipper_id: string; status: "requested" | "active" | "declined" | "left"; joined_at: string; decided_by: string | null; decision_reason: string | null },
        { campaign_id: string; clipper_id: string; status?: "requested" | "active" | "declined" | "left" }
      >;
      submissions: Table<
        { id: string; campaign_id: string; clipper_id: string; source_url: string; published_url: string; normalized_post_url: string; platform: "instagram_reels" | "youtube_shorts" | "tiktok" | "other"; published_at: string; notes: string; status: "submitted" | "under_review" | "changes_requested" | "accepted" | "rejected" | "withdrawn"; terms_snapshot: Json; created_at: string; updated_at: string },
        { campaign_id: string; clipper_id: string; source_url: string; published_url: string; platform: "instagram_reels" | "youtube_shorts" | "tiktok" | "other"; published_at: string; notes?: string }
      >;
      submission_reviews: Table<
        { id: string; submission_id: string; reviewer_id: string; decision: "under_review" | "changes_requested" | "accepted" | "rejected"; reason: string; created_at: string }
      >;
      account_deletion_requests: Table<{ id: string; user_id: string; status: string; created_at: string }>;
    };
    Views: {
      published_campaign_business_directory: { Row: { id: string; company_name: string }; Relationships: [] };
    };
    Functions: {
      request_campaign_review: { Args: { p_campaign_id: string }; Returns: undefined };
      save_campaign_draft: { Args: { p_campaign_id: string | null; p_business_id: string; p_title: string; p_description: string; p_source_url: string | null; p_source_rights_confirmed: boolean; p_languages: string[]; p_platforms: string[]; p_starts_at: string | null; p_ends_at: string | null; p_budget_paise: number; p_base_reward_paise: number; p_join_mode: "open" | "approval"; p_bonus_rules: Json; p_bonus_scope: string | null; p_bonus_stacking: string | null; p_terms: Json }; Returns: string };
      join_campaign: { Args: { p_campaign_id: string }; Returns: "requested" | "active" | "declined" | "left" };
      business_decide_participation: { Args: { p_campaign_id: string; p_clipper_id: string; p_decision: "active" | "declined"; p_reason?: string | null }; Returns: undefined };
      submit_clip: { Args: { p_campaign_id: string; p_source_url: string; p_published_url: string; p_platform: "instagram_reels" | "youtube_shorts" | "tiktok" | "other"; p_published_at: string; p_notes?: string }; Returns: string };
      resubmit_clip: { Args: { p_submission_id: string; p_source_url: string; p_published_url: string; p_platform: "instagram_reels" | "youtube_shorts" | "tiktok" | "other"; p_published_at: string; p_notes?: string }; Returns: undefined };
      admin_set_user_role: { Args: { p_user_id: string; p_role: "business" | "clipper" | "admin"; p_status: "pending" | "active" | "rejected" | "suspended"; p_reason?: string | null }; Returns: undefined };
      admin_review_business: { Args: { p_business_id: string; p_decision: "approved" | "rejected" | "suspended"; p_reason?: string | null }; Returns: undefined };
      admin_review_campaign: { Args: { p_campaign_id: string; p_decision: "published" | "changes_requested" | "rejected"; p_reason?: string | null }; Returns: undefined };
      admin_review_submission: { Args: { p_submission_id: string; p_decision: "under_review" | "changes_requested" | "accepted" | "rejected"; p_reason?: string | null }; Returns: undefined };
    };
    Enums: {
      user_role: "business" | "clipper" | "admin";
      account_status: "pending" | "active" | "rejected" | "suspended";
      business_status: "pending" | "approved" | "rejected" | "suspended";
    };
    CompositeTypes: Record<string, never>;
  };
};
