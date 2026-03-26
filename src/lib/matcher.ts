import Fuse from 'fuse.js'
import type { ASDLead, DealRecord, MatchResult } from './types'

// Normalize strings for comparison
function norm(s: string | null | undefined): string {
  if (!s) return ''
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9@.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalize phone: strip to digits only
function normPhone(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/[^0-9]/g, '').slice(-10) // last 10 digits
}

// Normalize company: remove common suffixes for better matching
function normCompany(s: string | null | undefined): string {
  if (!s) return ''
  return norm(s)
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|international|enterprises?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchLeadsToDeals(leads: ASDLead[], deals: DealRecord[]): MatchResult[] {
  // Build lookup indexes from deals
  const emailIndex = new Map<string, DealRecord[]>()
  const phoneIndex = new Map<string, DealRecord[]>()

  for (const d of deals) {
    // Index by all email variants
    for (const e of [d.submitted_email, d.phone ? undefined : undefined].filter(Boolean)) {
      const ne = norm(e)
      if (ne && ne.includes('@')) {
        if (!emailIndex.has(ne)) emailIndex.set(ne, [])
        emailIndex.get(ne)!.push(d)
      }
    }
    const se = norm(d.submitted_email)
    if (se && se.includes('@')) {
      if (!emailIndex.has(se)) emailIndex.set(se, [])
      if (!emailIndex.get(se)!.includes(d)) emailIndex.get(se)!.push(d)
    }

    // Index by phone
    for (const p of [d.submitted_phone, d.phone]) {
      const np = normPhone(p)
      if (np.length >= 10) {
        if (!phoneIndex.has(np)) phoneIndex.set(np, [])
        if (!phoneIndex.get(np)!.includes(d)) phoneIndex.get(np)!.push(d)
      }
    }
  }

  // Set up Fuse.js for fuzzy company name matching
  const dealCompanyList = deals
    .filter(d => d.submitted_company_name || d.company_name)
    .map(d => ({
      deal: d,
      companyNorm: normCompany(d.submitted_company_name || d.company_name),
      companyRaw: d.submitted_company_name || d.company_name || '',
    }))

  const fuse = new Fuse(dealCompanyList, {
    keys: ['companyNorm'],
    threshold: 0.3, // fairly strict fuzzy match
    includeScore: true,
  })

  const results: MatchResult[] = []

  for (const lead of leads) {
    const matchedDeals = new Map<string, DealRecord>() // dedup by deal id
    const matchedOn: string[] = []
    let confidence: MatchResult['confidence'] = 'none'

    // 1. Exact email match (highest confidence)
    const leadEmail = norm(lead.email)
    if (leadEmail && leadEmail.includes('@') && emailIndex.has(leadEmail)) {
      for (const d of emailIndex.get(leadEmail)!) {
        matchedDeals.set(d.id, d)
      }
      matchedOn.push('email')
      confidence = 'exact'
    }

    // 2. Phone match
    const leadPhone = normPhone(lead.phone)
    if (leadPhone.length >= 10 && phoneIndex.has(leadPhone)) {
      for (const d of phoneIndex.get(leadPhone)!) {
        matchedDeals.set(d.id, d)
      }
      if (!matchedOn.includes('phone')) matchedOn.push('phone')
      confidence = confidence === 'exact' ? 'exact' : 'high'
    }

    // 3. Fuzzy company name match (only if no email/phone match yet, or to supplement)
    if (lead.company) {
      const leadCoNorm = normCompany(lead.company)
      if (leadCoNorm.length >= 3) {
        const fuseResults = fuse.search(leadCoNorm)
        for (const fr of fuseResults) {
          if (fr.score !== undefined && fr.score < 0.25) {
            matchedDeals.set(fr.item.deal.id, fr.item.deal)
            if (!matchedOn.includes('company')) matchedOn.push('company')
            if (confidence === 'none') confidence = 'fuzzy'
            if (confidence === 'high') confidence = 'high' // keep high if phone matched
          }
        }
      }
    }

    const dealArray = Array.from(matchedDeals.values())

    results.push({
      lead: {
        ...lead,
        matched_deals: dealArray,
        match_confidence: confidence,
        total_deals: dealArray.length,
        has_active_deal: dealArray.some(d =>
          !['closed_won', 'closed_lost', 'closed_bidfta_declined'].includes(d.stage)
        ),
      },
      deals: dealArray,
      confidence,
      matchedOn,
    })
  }

  return results
}

// ─── STATS HELPERS ──────────────────────────────────────────────────
export function getMatchSummary(results: MatchResult[]) {
  const total = results.length
  const matched = results.filter(r => r.confidence !== 'none').length
  const exact = results.filter(r => r.confidence === 'exact').length
  const high = results.filter(r => r.confidence === 'high').length
  const fuzzy = results.filter(r => r.confidence === 'fuzzy').length
  const unmatched = total - matched

  const withActiveDeals = results.filter(r => r.lead.has_active_deal).length
  const totalDealLinks = results.reduce((sum, r) => sum + r.deals.length, 0)

  return { total, matched, exact, high, fuzzy, unmatched, withActiveDeals, totalDealLinks }
}
