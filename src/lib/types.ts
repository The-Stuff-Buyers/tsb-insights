// ─── ASD Lead (from CSV upload) ─────────────────────────────────────
export interface ASDLead {
  captured_at: string
  captured_by: string
  full_name: string
  title: string
  company: string
  email: string
  phone: string
  website: string
  city: string
  state: string
  inventory_type: string
  estimated_volume: string
  follow_up: string
  follow_up_notes: string
  notes: string
  // Show tracking
  show_name: string
  source_file: string
  // Enriched fields
  product_categories: string[]
  pipeline_stage: string
  business_type: string
  urgency: 'High' | 'Normal'
  // Match status
  matched_deals?: DealRecord[]
  match_confidence?: 'exact' | 'high' | 'fuzzy' | 'none'
  total_deals?: number
  has_active_deal?: boolean
}

// ─── Supabase: deals table ──────────────────────────────────────────
export interface DealRecord {
  id: string
  deal_id: string
  stage: string
  item_name: string
  description: string
  condition: string
  quantity: number
  category_id: string
  product_category: string
  location_city: string
  location_state: string
  submitted_contact_name: string
  submitted_company_name: string
  submitted_phone: string
  submitted_email: string
  submitted_website: string
  company_name: string
  contact_name: string
  phone: string
  website: string
  source: string
  referral_source: string
  assigned_to: string
  retail_value: number
  seller_estimated_value: number
  gate1_created_at: string
  gate1_approved_at: string
  submitted_to_bidfta: string
  offer_sent_at: string
  closed_at: string
  close_reason: string
  actual_recovery: number
  commission_earned: number
  sla_target_at: string
  sla_breached_at: string
  tags: string[]
  notes: string
  created_at: string
  updated_at: string
  // Joined
  active_quote?: QuoteRecord
  latest_quote?: QuoteRecord
}

// ─── Supabase: quotes table ─────────────────────────────────────────
export interface QuoteRecord {
  id: string
  deal_id: string
  customer_reference: string
  partner_name: string
  status: string
  offer_type: string
  cash_offer_per_unit: number
  cash_offer_total: number
  consignment_return: number
  expected_recovery: number
  quantity_offered: number
  pickup_logistics: string
  payment_structure: string
  notes: string
  received_at: string
  created_at: string
}

// ─── Supabase: form_submissions table ───────────────────────────────
export interface FormSubmission {
  id: string
  submitted_at: string
  contact_name: string
  company_name: string
  email: string
  phone: string
  website: string
  item_name: string
  description: string
  quantity: number
  product_category: string
  processed: boolean
  deal_id: string
  source: string
}

// ─── Supabase: deal_events table ────────────────────────────────────
export interface DealEvent {
  id: string
  deal_id: string
  created_at: string
  event_type: string
  actor: string
  actor_name: string
  from_stage: string
  to_stage: string
  notes: string
}

// ─── Match result ───────────────────────────────────────────────────
export interface MatchResult {
  lead: ASDLead
  deals: DealRecord[]
  confidence: 'exact' | 'high' | 'fuzzy' | 'none'
  matchedOn: string[] // e.g. ['email', 'company']
}

// ─── Dashboard stats ────────────────────────────────────────────────
export interface DashboardStats {
  totalLeads: number
  uniqueCompanies: number
  states: number
  cities: number
  emailRate: number
  phoneRate: number
  teamMembers: number
  urgentLeads: number
  matchedLeads: number
  matchRate: number
  totalDeals: number
  totalQuotes: number
  totalRevenue: number
  avgCycleTime: number
  catCounts: Record<string, number>
  pipeCounts: Record<string, number>
  bizCounts: Record<string, number>
  stateCounts: Record<string, number>
  cityCounts: Record<string, number>
  teamCounts: Record<string, number>
  dayCounts: Record<string, number>
  dealStageCounts: Record<string, number>
}

export type TabId = 'overview' | 'pipeline' | 'live_deals' | 'market' | 'categories' | 'team' | 'quality' | 'directory' | 'action'
