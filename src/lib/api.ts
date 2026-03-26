import { supabase } from './supabase'
import type { DealRecord, QuoteRecord, FormSubmission, DealEvent } from './types'

export async function fetchDeals(): Promise<DealRecord[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching deals:', error)
    return []
  }
  return (data || []) as DealRecord[]
}

export async function fetchQuotes(): Promise<QuoteRecord[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching quotes:', error)
    return []
  }
  return (data || []) as QuoteRecord[]
}

export async function fetchFormSubmissions(): Promise<FormSubmission[]> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Error fetching form submissions:', error)
    return []
  }
  return (data || []) as FormSubmission[]
}

export async function fetchDealEvents(dealId?: string): Promise<DealEvent[]> {
  let query = supabase
    .from('deal_events')
    .select('*')
    .order('created_at', { ascending: false })

  if (dealId) {
    query = query.eq('deal_id', dealId)
  }

  const { data, error } = await query.limit(500)

  if (error) {
    console.error('Error fetching deal events:', error)
    return []
  }
  return (data || []) as DealEvent[]
}

// Fetch deals with their active/latest quotes joined
export async function fetchDealsWithQuotes(): Promise<DealRecord[]> {
  const [deals, quotes] = await Promise.all([fetchDeals(), fetchQuotes()])

  const quoteMap = new Map<string, QuoteRecord[]>()
  for (const q of quotes) {
    if (!quoteMap.has(q.deal_id)) quoteMap.set(q.deal_id, [])
    quoteMap.get(q.deal_id)!.push(q)
  }

  return deals.map(d => {
    const dealQuotes = quoteMap.get(d.id) || []
    const latest = dealQuotes[0] // already sorted desc by created_at
    return {
      ...d,
      latest_quote: latest,
      active_quote: dealQuotes.find(q => q.status === 'received') || latest,
    }
  })
}

// ─── REALTIME SUBSCRIPTION ──────────────────────────────────────────
export function subscribeToDeals(callback: (payload: any) => void) {
  const channel = supabase
    .channel('deals-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'form_submissions' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, callback)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
