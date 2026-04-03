import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { classifyLead } from '@/lib/classify'
import { matchLeadsToDeals, getMatchSummary } from '@/lib/matcher'
import { fetchDealsWithQuotes, fetchFormSubmissions, subscribeToDeals } from '@/lib/api'
import type { ASDLead, DealRecord, MatchResult, FormSubmission } from '@/lib/types'
import { uploadShowFile, listShowFiles, downloadShowFile, deleteShowFile, updateLeadCount } from '@/lib/fileStore'
import type { TradeShowFile } from '@/lib/fileStore'

const GOLD = '#c9a84c'
const COLORS = ['#c9a84c','#e8c84a','#a08030','#d4b85c','#8b7028','#f0d878','#bca048','#7a6020','#e0c060','#6a5018','#5cb85c','#4a9','#d9534f','#8e44ad','#3498db','#e67e22']
const PC: Record<string, string> = {'Hot — Urgent':'#d9534f','Quote Submitted':'#5cb85c','Quote Expected':'#c9a84c','Warm — Needs Outreach':'#e67e22','Info Requested':'#3498db','Partnership / Referral':'#8e44ad','Cold — Low Priority':'#666','New Lead — Triage':'#555'}
const DSC: Record<string, string> = {gate1_pending:'#e67e22',submitted:'#3498db',submitted_to_bidfta:'#3498db',gate2_pending:'#8e44ad',offer_sent:'#c9a84c',closed_won:'#5cb85c',closed_lost:'#d9534f',closed_bidfta_declined:'#888',awaiting_info:'#f59e0b',bidfta_incomplete:'#999'}
const DSL: Record<string, string> = {gate1_pending:'Gate 1 Pending',submitted:'Submitted to BidFTA',submitted_to_bidfta:'At BidFTA — Awaiting Quote',gate2_pending:'Quote Received — Gate 2',offer_sent:'Offer Sent',closed_won:'Closed Won',closed_lost:'Closed Lost',closed_bidfta_declined:'BidFTA Declined',awaiting_info:'Awaiting More Info',bidfta_incomplete:'BidFTA Incomplete'}
const CC: Record<string, string> = {exact:'#5cb85c',high:'#c9a84c',fuzzy:'#e67e22',none:'#555'}
const se = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])
const pct = (n: number, t: number) => t ? Math.round(n / t * 100) : 0
const fc = (n: any) => n == null || isNaN(n) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
const fd = (s: any) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return s } }
const ta = (s: any) => { if (!s) return ''; const d = Math.floor((Date.now() - new Date(s).getTime())/1000); if (d<60) return 'just now'; if (d<3600) return `${Math.floor(d/60)}m ago`; if (d<86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago` }

// Derive show name from filename: "tsb_leads_asd2026.csv" → "ASD 2026", "magic_2026_leads.csv" → "MAGIC 2026"
function deriveShowName(filename: string): string {
  const base = filename.replace(/\.(csv|xlsx?)$/i, '').replace(/tsb[_-]?leads?[_-]?/i, '').replace(/[_-]/g, ' ').trim()
  return base.toUpperCase() || filename
}

function KPI({label,value,sub,accent}:{label:string;value:any;sub?:string;accent?:boolean}) {
  return <Card className={`border-zinc-800 bg-zinc-900 relative overflow-hidden hover:border-zinc-700 ${accent?'border-amber-900/50':''}`}><div className={`absolute top-0 left-0 right-0 h-[3px] ${accent?'bg-amber-600':'bg-zinc-700'}`}/><CardContent className="p-4"><p className="text-[0.6rem] font-bold uppercase tracking-wider text-zinc-500">{label}</p><p className={`text-2xl font-extrabold leading-tight mt-1 ${accent?'text-amber-500':'text-zinc-100'}`}>{value}</p>{sub&&<p className="text-[0.68rem] text-zinc-600 mt-1">{sub}</p>}</CardContent></Card>
}
function MB({c,n}:{c:string;n:number}) {
  if (c==='none') return <Badge variant="outline" className="text-zinc-600 border-zinc-700 text-[0.6rem]">No Match</Badge>
  const color = CC[c]||'#888'
  return <Badge style={{borderColor:color,color,background:color+'15'}} className="text-[0.6rem]">{c==='exact'?'✓ Exact':c==='high'?'◉ High':'~ Fuzzy'} · {n} deal{n!==1?'s':''}</Badge>
}

function LeadDrawer({result,onClose}:{result:MatchResult|null;onClose:()=>void}) {
  if (!result) return null
  const {lead:l,deals:d,confidence:c,matchedOn:mo} = result
  return <Sheet open={!!result} onOpenChange={()=>onClose()}>
    <SheetContent className="bg-zinc-950 border-zinc-800 w-[520px] sm:max-w-[520px] overflow-y-auto">
      <SheetHeader><SheetTitle className="text-amber-500 text-lg">{l.company||'Lead Detail'}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-5">
        <div className="flex gap-2 flex-wrap">
          {l.show_name&&<Badge className="bg-amber-900/20 text-amber-400 border-amber-800/50 text-[0.6rem]">📍 {l.show_name}</Badge>}
          <Badge style={{borderColor:PC[l.pipeline_stage],color:PC[l.pipeline_stage],background:(PC[l.pipeline_stage]||'#555')+'15'}} className="text-[0.6rem]">{l.pipeline_stage}</Badge>
          {l.urgency==='High'&&<Badge className="bg-red-900/30 text-red-400 border-red-800 text-[0.6rem]">URGENT</Badge>}
          <MB c={c} n={d.length}/>
          <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[0.6rem]">{l.business_type}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([['Contact',l.full_name],['Title',l.title],['Email',l.email],['Phone',l.phone],['Website',l.website],['Location',[l.city,l.state].filter(Boolean).join(', ')],['Captured By',l.captured_by],['Date',l.captured_at],['Show',l.show_name],['Source File',l.source_file]] as [string,string][]).filter(([,v])=>v).map(([k,v])=>
            <div key={k}><p className="text-[0.55rem] font-bold uppercase tracking-wider text-zinc-600">{k}</p><p className="text-[0.78rem] text-zinc-300 break-all">{v}</p></div>
          )}
        </div>
        <div><p className="text-[0.55rem] font-bold uppercase tracking-wider text-zinc-600 mb-1">Categories</p><div className="flex gap-1.5 flex-wrap">{l.product_categories.map(c=><Badge key={c} variant="outline" className="text-amber-500 border-amber-800/50 text-[0.6rem]">{c}</Badge>)}</div></div>
        {(l.follow_up_notes||l.notes)&&<div><p className="text-[0.55rem] font-bold uppercase tracking-wider text-zinc-600 mb-1">Notes</p>{l.follow_up_notes&&<p className="text-[0.75rem] text-amber-400/80 mb-1">» {l.follow_up_notes}</p>}{l.notes&&<p className="text-[0.75rem] text-zinc-400 leading-relaxed">{l.notes}</p>}</div>}
        <Separator className="bg-zinc-800"/>
        {d.length>0?<div><p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500 mb-2">🔗 Matched Deals ({d.length}) — via {mo.join(' + ')}</p>
          <div className="space-y-3">{d.map(deal=><Card key={deal.id} className="bg-zinc-900 border-zinc-800"><CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between"><span className="text-[0.72rem] font-semibold text-zinc-200">{deal.deal_id}</span><Badge style={{borderColor:DSC[deal.stage],color:DSC[deal.stage],background:(DSC[deal.stage]||'#888')+'15'}} className="text-[0.6rem] whitespace-nowrap">{DSL[deal.stage]||deal.stage}</Badge></div>
            <p className="text-[0.72rem] text-zinc-400">{deal.item_name||deal.description||'(no description)'}</p>
            <div className="grid grid-cols-3 gap-2 text-[0.65rem]"><div><span className="text-zinc-600">Qty: </span><span className="text-zinc-300">{deal.quantity||'—'}</span></div><div><span className="text-zinc-600">Retail: </span><span className="text-zinc-300">{fc(deal.retail_value)}</span></div><div><span className="text-zinc-600">Recovery: </span><span className="text-green-400">{fc(deal.actual_recovery)}</span></div></div>
            {deal.latest_quote&&<div className="bg-zinc-950 rounded p-2 mt-1"><p className="text-[0.6rem] font-semibold text-zinc-500 mb-1">BidFTA Quote</p><div className="grid grid-cols-2 gap-1 text-[0.65rem]"><div><span className="text-zinc-600">Cash: </span><span className="text-amber-400">{fc(deal.latest_quote.cash_offer_total)}</span></div><div><span className="text-zinc-600">Recovery: </span><span className="text-zinc-300">{fc(deal.latest_quote.expected_recovery)}</span></div><div><span className="text-zinc-600">Type: </span><span className="text-zinc-300">{deal.latest_quote.offer_type||'—'}</span></div><div><span className="text-zinc-600">Received: </span><span className="text-zinc-300">{fd(deal.latest_quote.received_at)}</span></div></div></div>}
            <p className="text-[0.6rem] text-zinc-600">Created {fd(deal.created_at)} · Updated {ta(deal.updated_at)}</p>
          </CardContent></Card>)}</div>
        </div>:<div className="text-center py-6"><p className="text-zinc-600 text-sm">No matching deals in Supabase</p><p className="text-zinc-700 text-[0.7rem] mt-1">This lead hasn't submitted a quote yet</p></div>}
      </div>
    </SheetContent>
  </Sheet>
}

function ST({results,onSelect}:{results:MatchResult[];onSelect:(r:MatchResult)=>void}) {
  const [search,setSearch]=useState('');const [sk,setSk]=useState<string|null>(null);const [sa,setSa]=useState(true)
  const f=useMemo(()=>{let d=results;if(search){const s=search.toLowerCase();d=d.filter(r=>[r.lead.company,r.lead.full_name,r.lead.email,r.lead.city,r.lead.state,r.lead.inventory_type,r.lead.pipeline_stage,r.lead.business_type,r.lead.show_name].some(v=>v&&v.toLowerCase().includes(s)))}if(sk){d=[...d].sort((a,b)=>{const va=String((a.lead as any)[sk]||'').toLowerCase();const vb=String((b.lead as any)[sk]||'').toLowerCase();return sa?va.localeCompare(vb):vb.localeCompare(va)})}return d},[results,search,sk,sa])
  const ts=(k:string)=>{if(sk===k)setSa(!sa);else{setSk(k);setSa(true)}}
  return <Card className="bg-zinc-900 border-zinc-800">
    <div className="flex items-center justify-between p-3 border-b border-zinc-800"><span className="text-[0.65rem] text-zinc-600 font-semibold">{f.length} of {results.length}</span><Input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="w-52 h-8 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"/></div>
    <ScrollArea className="max-h-[500px]"><Table><TableHeader><TableRow className="border-zinc-800 hover:bg-transparent">
      {[{k:'company',l:'Company'},{k:'full_name',l:'Contact'},{k:'state',l:'State'},{k:'show_name',l:'Show'},{k:'pipeline_stage',l:'Stage'},{k:'match_confidence',l:'DB Match'},{k:'business_type',l:'Biz Type'}].map(c=><TableHead key={c.k} onClick={()=>ts(c.k)} className="text-[0.6rem] font-bold uppercase tracking-wider text-zinc-600 cursor-pointer hover:text-amber-500 whitespace-nowrap">{c.l}{sk===c.k?(sa?' ▲':' ▼'):''}</TableHead>)}
    </TableRow></TableHeader><TableBody>
      {f.map((r,i)=><TableRow key={i} onClick={()=>onSelect(r)} className="border-zinc-800/50 cursor-pointer hover:bg-amber-500/5">
        <TableCell className="text-zinc-200 font-medium text-xs">{r.lead.company||'—'}</TableCell>
        <TableCell className="text-zinc-400 text-xs">{r.lead.full_name||'—'}</TableCell>
        <TableCell className="text-zinc-500 text-xs">{r.lead.state||'—'}</TableCell>
        <TableCell><Badge variant="outline" className="text-amber-400 border-amber-800/40 text-[0.55rem]">{r.lead.show_name||'—'}</Badge></TableCell>
        <TableCell><Badge style={{borderColor:PC[r.lead.pipeline_stage],color:PC[r.lead.pipeline_stage],background:(PC[r.lead.pipeline_stage]||'#555')+'15'}} className="text-[0.55rem]">{r.lead.pipeline_stage}</Badge></TableCell>
        <TableCell><MB c={r.confidence} n={r.deals.length}/></TableCell>
        <TableCell className="text-zinc-500 text-xs">{r.lead.business_type}</TableCell>
      </TableRow>)}
    </TableBody></Table></ScrollArea>
  </Card>
}

export default function App() {
  const [leads,sL]=useState<ASDLead[]>([]);const [deals,sD]=useState<DealRecord[]>([]);const [fs,sFS]=useState<FormSubmission[]>([])
  const [mr,sMR]=useState<MatchResult[]>([]);const [sel,sSel]=useState<MatchResult|null>(null)
  const [files,sFiles]=useState<{name:string;showName:string;count:number;storedId?:string;storagePath?:string}[]>([])
  const [ld,sLd]=useState(false);const [dbl,sDBL]=useState(false)
  const [dbc,sDBC]=useState(false);const [_dbe,sDBE]=useState<string|null>(null);const [ls,sLS]=useState<Date|null>(null)
  const [fC,sFC]=useState<string|null>(null);const [fP,sFP]=useState<string|null>(null);const [fM,sFM]=useState<string|null>(null);const [fS,sFS2]=useState<string|null>(null)
  const fr=useRef<HTMLInputElement>(null)
  // Accumulated leads across multiple uploads
  const allLeadsRef=useRef<ASDLead[]>([])
  // Mirror of deals state kept in a ref so async callbacks can read the latest value
  const dealsRef=useRef<DealRecord[]>([])

  const loadDB=useCallback(async()=>{
    sDBL(true);sDBE(null)
    try{const[d,f]=await Promise.all([fetchDealsWithQuotes(),fetchFormSubmissions()]);sD(d);dealsRef.current=d;sFS(f);sDBC(true);sLS(new Date())
      if(allLeadsRef.current.length>0){const r=matchLeadsToDeals(allLeadsRef.current,d);sMR(r);sL(r.map(x=>x.lead))}
    }catch(e:any){console.error('DB:',e);sDBE(e.message||'Failed');sDBC(false)}
    sDBL(false)
  },[])

  useEffect(()=>{loadDB()},[])
  useEffect(()=>{const u=subscribeToDeals(()=>{loadDB()});return u},[loadDB])

  // Stored show metadata (populated before files download — used to show chips on empty state)
  const [storedShows,sStoredShows]=useState<TradeShowFile[]>([])
  const [restoring,sRestoring]=useState(true)

  // Restore previously uploaded show files from Supabase storage on mount
  useEffect(()=>{
    ;(async()=>{
      const stored=await listShowFiles()
      sStoredShows(stored)
      sRestoring(false)
      if(!stored.length)return
      const downloads=await Promise.all(stored.map(sf=>downloadShowFile(sf.storage_path).then(f=>({sf,f}))))
      const valid=downloads.filter(x=>x.f!==null) as {sf:TradeShowFile;f:File}[]
      if(!valid.length)return
      const results=await Promise.all(valid.map(({sf,f})=>new Promise<{file:File;rows:ASDLead[];sf:TradeShowFile}>(resolve=>{
        Papa.parse(f,{header:true,skipEmptyLines:true,complete:(res:Papa.ParseResult<Record<string,string>>)=>{
          const showName=sf.show_name
          const cl=res.data.map((r:any)=>{const n:Record<string,string>={};for(const[k,v]of Object.entries(r)){n[k.trim().toLowerCase().replace(/\s+/g,'_')]=typeof v==='string'?v.trim():String(v||'')};n.show_name=n.show_name||showName;n.source_file=f.name;return n}).filter((r:any)=>r.company||r.full_name)
          resolve({file:f,rows:cl.map(classifyLead),sf})
        }})
      })))
      const newFiles=results.map(r=>({name:r.file.name,showName:r.sf.show_name,count:r.rows.length,storedId:r.sf.id,storagePath:r.sf.storage_path}))
      const newRows=results.flatMap(r=>r.rows)
      const combined=[...allLeadsRef.current,...newRows]
      allLeadsRef.current=combined
      sFiles(prev=>[...prev,...newFiles])
      sL(combined)
      if(dealsRef.current.length>0){const mr2=matchLeadsToDeals(combined,dealsRef.current);sMR(mr2);sL(mr2.map(x=>x.lead))}
      else{sMR(combined.map(l=>({lead:l,deals:[],confidence:'none' as const,matchedOn:[]})))}
    })()
  },[])

  const handleFiles=useCallback((fileList:FileList)=>{
    sLd(true)
    const promises=Array.from(fileList).map(file=>new Promise<{file:File;rows:ASDLead[]}>((resolve)=>{
      Papa.parse(file,{header:true,skipEmptyLines:true,complete:(res: Papa.ParseResult<Record<string,string>>)=>{
        const showName=deriveShowName(file.name)
        const cl=res.data.map((r:any)=>{const n:Record<string,string>={};for(const[k,v]of Object.entries(r)){n[k.trim().toLowerCase().replace(/\s+/g,'_')]=typeof v==='string'?v.trim():String(v||'')};n.show_name=n.show_name||showName;n.source_file=file.name;return n}).filter((r:any)=>r.company||r.full_name)
        resolve({file,rows:cl.map(classifyLead)})
      }})
    }))
    Promise.all(promises).then(results=>{
      const newFiles=results.map(r=>({name:r.file.name,showName:deriveShowName(r.file.name),count:r.rows.length}))
      const newRows=results.flatMap(r=>r.rows)
      // Append to accumulated leads (allows progressive loading)
      const combined=[...allLeadsRef.current,...newRows]
      allLeadsRef.current=combined
      sFiles(prev=>[...prev,...newFiles])
      sL(combined)
      if(deals.length>0){const mr2=matchLeadsToDeals(combined,deals);sMR(mr2);sL(mr2.map(x=>x.lead))}
      else{sMR(combined.map(l=>({lead:l,deals:[],confidence:'none' as const,matchedOn:[]})))}
      sLd(false)
      // Upload each file to storage and update lead_count (non-blocking, graceful degradation)
      results.forEach(({file,rows})=>{
        uploadShowFile(file,deriveShowName(file.name)).then(stored=>{
          if(!stored)return
          updateLeadCount(stored.id,rows.length).catch(console.error)
          sFiles(prev=>prev.map(f=>f.name===file.name?{...f,storedId:stored.id,storagePath:stored.storage_path}:f))
        }).catch(console.error)
      })
    })
  },[deals])

  const removeFile=(fileName:string)=>{
    const updated=allLeadsRef.current.filter(l=>l.source_file!==fileName)
    allLeadsRef.current=updated
    const entry=files.find(f=>f.name===fileName)
    sFiles(prev=>prev.filter(f=>f.name!==fileName))
    sL(updated)
    if(deals.length>0){const mr2=matchLeadsToDeals(updated,deals);sMR(mr2);sL(mr2.map(x=>x.lead))}
    else{sMR(updated.map(l=>({lead:l,deals:[],confidence:'none' as const,matchedOn:[]})))}
    // Delete from storage + DB (best-effort, non-blocking)
    if(entry?.storedId&&entry?.storagePath){deleteShowFile(entry.storedId,entry.storagePath).catch(console.error)}
  }

  const hd=useCallback((e:React.DragEvent)=>{e.preventDefault();if(e.dataTransfer?.files?.length)handleFiles(e.dataTransfer.files)},[handleFiles])

  // All filters including show
  const filtered=useMemo(()=>{
    let d=mr;if(fC)d=d.filter(r=>r.lead.product_categories.includes(fC));if(fP)d=d.filter(r=>r.lead.pipeline_stage===fP)
    if(fS)d=d.filter(r=>r.lead.show_name===fS)
    if(fM){if(fM==='matched')d=d.filter(r=>r.confidence!=='none');else if(fM==='unmatched')d=d.filter(r=>r.confidence==='none');else d=d.filter(r=>r.confidence===fM)}
    return d
  },[mr,fC,fP,fM,fS])

  const showNames=useMemo(()=>[...new Set(leads.map(l=>l.show_name).filter(Boolean))],[leads])

  const stats=useMemo(()=>{
    const src=fS?leads.filter(l=>l.show_name===fS):leads
    if(!src.length)return null;const t=src.length;const fmr=fS?mr.filter(r=>r.lead.show_name===fS):mr;const ms=getMatchSummary(fmr)
    const cnt=(a:any[],k:string)=>{const c:Record<string,number>={};a.forEach((r:any)=>{const v=r[k];if(v)c[v]=(c[v]||0)+1});return c}
    const cc:Record<string,number>={};src.forEach(l=>l.product_categories.forEach(c=>{cc[c]=(cc[c]||0)+1}))
    const dsc:Record<string,number>={};deals.forEach(d=>{dsc[d.stage]=(dsc[d.stage]||0)+1})
    const shc:Record<string,number>={};leads.forEach(l=>{if(l.show_name)shc[l.show_name]=(shc[l.show_name]||0)+1})
    return{tl:t,uc:new Set(src.filter(l=>l.company).map(l=>l.company.toLowerCase().trim())).size,
      st:new Set(src.filter(l=>l.state).map(l=>l.state)).size,ci:new Set(src.filter(l=>l.city).map(l=>l.city)).size,
      er:src.filter(l=>l.email).length,pr:src.filter(l=>l.phone).length,
      tm:new Set(src.filter(l=>l.captured_by).map(l=>l.captured_by)).size,ul:src.filter(l=>l.urgency==='High').length,
      ms,td:deals.length,tfs:fs.length,tr:deals.reduce((s,d)=>s+(d.actual_recovery||0),0),tc:deals.reduce((s,d)=>s+(d.commission_earned||0),0),
      cc,pc:cnt(src,'pipeline_stage'),bc:cnt(src,'business_type'),sc:cnt(src.filter(l=>l.state),'state'),
      ctc:cnt(src.filter(l=>l.city),'city'),tmc:cnt(src.filter(l=>l.captured_by),'captured_by'),dc:cnt(src,'captured_at'),dsc,shc,
      totalAllShows:leads.length}
  },[leads,deals,fs,mr,fS])

  const exp=()=>{if(!mr.length)return;const r=(fS?mr.filter(x=>x.lead.show_name===fS):mr).map(r=>({...r.lead,product_categories:r.lead.product_categories.join('|'),match_confidence:r.confidence,matched_on:r.matchedOn.join('+'),deal_count:r.deals.length,deal_ids:r.deals.map(d=>d.deal_id).join('; ')}));const csv=Papa.unparse(r);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`tsb_leads_${fS||'all_shows'}_matched.csv`;a.click()}

  if(!leads.length) return(
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-400" onDragOver={e=>e.preventDefault()} onDrop={hd}>
      <div className="border-b border-zinc-800 px-6 py-4"><div className="max-w-[1400px] mx-auto flex items-end justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-amber-500 tracking-tighter leading-[0.95]">TRADE SHOW INSIGHTS.</h1><p className="text-[0.65rem] text-zinc-600 mt-1">The Stuff Buyers — Lead Intelligence Platform</p></div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded-lg border ${dbc?'border-green-900/50 text-green-500':dbl?'border-zinc-700 text-zinc-500':'border-red-900/50 text-red-400'}`}><div className={`w-1.5 h-1.5 rounded-full ${dbc?'bg-green-500 animate-pulse':dbl?'bg-zinc-500 animate-pulse':'bg-red-500'}`}/>{dbl?'Connecting...':dbc?`Live · ${deals.length} deals`:'Disconnected'}</div>
          <Button variant="outline" size="sm" onClick={loadDB} disabled={dbl} className="text-xs border-zinc-700 text-zinc-400 hover:text-amber-500 h-7">{dbl?'↻ Syncing...':'↻ Sync'}</Button>
          <Button variant="outline" size="sm" onClick={()=>fr.current?.click()} className="text-xs border-amber-700/60 text-amber-500 hover:bg-amber-500/10 h-7">+ Add Show CSV</Button>
          <input ref={fr} type="file" accept=".csv" multiple className="hidden" onChange={e=>e.target.files?.length&&handleFiles(e.target.files)}/>
        </div>
      </div></div>
      <div className="px-6 pt-6 pb-4 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPI label="Total Deals" value={deals.length} accent/>
          <KPI label="In Pipeline" value={deals.filter(d=>!['closed_won','closed_lost','closed_bidfta_declined','closed_expired','closed_declined','closed_withdrawn'].includes(d.stage)).length}/>
          <KPI label="At BidFTA" value={deals.filter(d=>['submitted_to_bidfta','submitted'].includes(d.stage)).length}/>
          <KPI label="Form Submissions" value={fs.length}/>
        </div>
        {/* Stored shows — loading or chips */}
        {restoring&&<div className="flex items-center gap-2 mb-4 text-xs text-zinc-600"><div className="w-3 h-3 border border-zinc-600 border-t-amber-500 rounded-full animate-spin"/>Loading saved shows...</div>}
        {!restoring&&storedShows.length>0&&(
          <div className="mb-5">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-600 mb-2">Saved Shows — loading data...</p>
            <div className="flex flex-wrap gap-2">
              {storedShows.map(sf=>(
                <div key={sf.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-900/40 bg-amber-950/20 text-amber-500 text-xs font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>
                  {sf.show_name} <span className="text-amber-700">· {sf.lead_count} leads</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div onClick={()=>fr.current?.click()} onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=GOLD}} onDragLeave={e=>{e.currentTarget.style.borderColor=''}}
          className="border-2 border-dashed border-zinc-800 rounded-xl p-10 text-center cursor-pointer hover:border-amber-500/40 transition-colors">
          <div className="text-3xl mb-2">⬆</div>
          <div className="text-base font-bold text-amber-500 mb-1">Drop trade show lead CSVs to cross-reference your pipeline</div>
          <div className="text-xs text-zinc-600">Each file becomes a filterable show · Auto-matches against {deals.length} live deals</div>
          {ld&&<p className="text-amber-500 text-xs mt-3 animate-pulse">Processing...</p>}
        </div>
      </div>
    </div>
  )

  const iF=fC||fP||fM||fS
  return(
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-400">
      <div className="border-b border-zinc-800 px-6 py-4"><div className="max-w-[1400px] mx-auto flex items-end justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-amber-500 tracking-tighter leading-[0.95]">TRADE SHOW INSIGHTS.</h1><p className="text-[0.65rem] text-zinc-600 mt-1">The Stuff Buyers — Lead Intelligence Platform</p></div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Show selector */}
          <Select value={fS||'__all'} onValueChange={v=>sFS2(v==='__all'?null:v)}>
            <SelectTrigger className="w-44 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-300"><SelectValue placeholder="All Shows"/></SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">{[['__all',`All Shows (${leads.length})`],...showNames.map(s=>[s,`${s} (${leads.filter(l=>l.show_name===s).length})`])].map(([v,l])=><SelectItem key={v} value={v} className="text-xs text-zinc-300">{l}</SelectItem>)}</SelectContent>
          </Select>
          <div className={`flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded-lg border ${dbc?'border-green-900/50 text-green-500':'border-red-900/50 text-red-400'}`}><div className={`w-1.5 h-1.5 rounded-full ${dbc?'bg-green-500 animate-pulse':'bg-red-500'}`}/>{dbc?`Live · ${deals.length} deals`:'Disconnected'}{ls&&<span className="text-zinc-700 ml-1">· {ta(ls.toISOString())}</span>}</div>
          <Button variant="outline" size="sm" onClick={loadDB} disabled={dbl} className="text-xs border-zinc-700 text-zinc-400 hover:text-amber-500 h-7">{dbl?'↻ Syncing...':'↻ Sync'}</Button>
          <Button variant="outline" size="sm" onClick={()=>fr.current?.click()} className="text-xs border-zinc-700 text-zinc-400 hover:text-amber-500 h-7">+ Add Show</Button>
          <input ref={fr} type="file" accept=".csv" multiple className="hidden" onChange={e=>e.target.files?.length&&handleFiles(e.target.files)}/>
          <Button variant="outline" size="sm" onClick={exp} className="text-xs border-amber-800/50 text-amber-500 hover:bg-amber-500/10 h-7">↓ Export</Button>
        </div>
      </div></div>

      {/* Loaded files bar */}
      {files.length>0&&<div className="border-b border-zinc-800 px-6 py-2"><div className="max-w-[1400px] mx-auto flex items-center gap-2 flex-wrap">
        <span className="text-[0.6rem] text-zinc-600 font-bold uppercase">Loaded:</span>
        {files.map(f=><Badge key={f.name} variant="outline" className="text-zinc-400 border-zinc-700 text-[0.6rem] gap-1">📄 {f.showName} ({f.count})<button onClick={()=>removeFile(f.name)} className="text-zinc-600 hover:text-red-400 ml-1">×</button></Badge>)}
        <span className="text-[0.6rem] text-zinc-600">{leads.length} total leads across {showNames.length} show{showNames.length!==1?'s':''}</span>
      </div></div>}

      <div className="max-w-[1400px] mx-auto px-6"><Tabs defaultValue="overview">
        <TabsList className="bg-transparent border-b border-zinc-800 rounded-none h-auto p-0 w-full justify-start gap-0">
          {[{id:'overview',l:'Overview'},{id:'pipeline',l:'Pipeline'},{id:'live_deals',l:'🔴 Live Deals'},{id:'market',l:'Market Map'},{id:'categories',l:'Categories'},{id:'team',l:'Team'},{id:'quality',l:'Data Quality'},{id:'directory',l:'Directory'},{id:'action',l:'Action Items'}].map(t=>
            <TabsTrigger key={t.id} value={t.id} className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:text-amber-500 text-zinc-600 text-[0.72rem] font-medium px-4 py-2.5 bg-transparent data-[state=active]:bg-transparent">{t.l}</TabsTrigger>
          )}
        </TabsList>

        {iF&&<div className="flex items-center gap-2 flex-wrap mt-3 mb-1"><span className="text-[0.6rem] text-zinc-600 font-bold uppercase">Filters:</span>{fS&&<Badge className="bg-amber-900/20 text-amber-400 border-amber-800/50 text-[0.6rem] cursor-pointer" onClick={()=>sFS2(null)}>Show: {fS} ×</Badge>}{fC&&<Badge variant="outline" className="text-amber-500 border-amber-800 text-[0.6rem] cursor-pointer" onClick={()=>sFC(null)}>{fC} ×</Badge>}{fP&&<Badge style={{color:PC[fP],borderColor:PC[fP]}} className="text-[0.6rem] cursor-pointer" onClick={()=>sFP(null)}>{fP} ×</Badge>}{fM&&<Badge variant="outline" className="text-zinc-400 border-zinc-700 text-[0.6rem] cursor-pointer" onClick={()=>sFM(null)}>{fM} ×</Badge>}<button onClick={()=>{sFC(null);sFP(null);sFM(null);sFS2(null)}} className="text-[0.6rem] text-red-400">Clear All</button></div>}

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-6">{stats&&<>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <KPI label="Total Leads" value={stats.tl} sub={fS?`from ${fS}`:`${showNames.length} show${showNames.length!==1?'s':''}`} accent/>
            <KPI label="Unique Companies" value={stats.uc} sub={`${pct(stats.uc,stats.tl)}% unique`}/>
            <KPI label="DB Matches" value={stats.ms.matched} sub={`${pct(stats.ms.matched,stats.tl)}% match rate`} accent={stats.ms.matched>0}/>
            <KPI label="Active Deals" value={stats.ms.withActiveDeals} sub="from leads"/>
            <KPI label="Total Deals" value={stats.td} sub="in Supabase"/>
            <KPI label="States" value={stats.st} sub="geographic reach"/>
            <KPI label="Email Rate" value={`${pct(stats.er,stats.tl)}%`} sub={`${stats.er} captured`}/>
            <KPI label="Urgent" value={stats.ul} sub="time-sensitive" accent={stats.ul>0}/>
          </div>
          {/* Show breakdown (only if multiple shows) */}
          {showNames.length>1&&!fS&&<div><h3 className="text-sm font-bold text-amber-500 mb-3 pb-2 border-b border-zinc-800">Trade Show Comparison</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{se(stats.shc||{}).map(([show,count],i)=><Card key={show} className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-700" onClick={()=>sFS2(show)}><CardContent className="p-3 text-center"><div className="text-2xl font-extrabold" style={{color:COLORS[i%COLORS.length]}}>{count}</div><div className="text-xs font-semibold text-zinc-300 mt-0.5">{show}</div><div className="text-[0.6rem] text-zinc-600">{pct(count,stats.totalAllShows)}% of all leads</div></CardContent></Card>)}</div>
          </div>}
          <div><h3 className="text-sm font-bold text-amber-500 mb-3 pb-2 border-b border-zinc-800">Database Match Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[{l:'Exact Match',v:stats.ms.exact,c:'#5cb85c',d:'email',f:'exact'},{l:'High Confidence',v:stats.ms.high,c:'#c9a84c',d:'phone',f:'high'},{l:'Fuzzy Match',v:stats.ms.fuzzy,c:'#e67e22',d:'company name',f:'fuzzy'},{l:'No Match',v:stats.ms.unmatched,c:'#555',d:'no quote yet',f:'unmatched'},{l:'Total Deal Links',v:stats.ms.totalDealLinks,c:'#3498db',d:'all matches',f:'matched'}].map(i=>
                <Card key={i.l} className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-700" onClick={()=>sFM(fM===i.f?null:i.f)}><CardContent className="p-3 text-center"><div className="text-2xl font-extrabold" style={{color:i.c}}>{i.v}</div><div className="text-[0.65rem] font-semibold text-zinc-400 mt-0.5">{i.l}</div><div className="text-[0.6rem] text-zinc-600">{i.d}</div></CardContent></Card>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Day Breakdown</CardTitle></CardHeader><CardContent className="space-y-2">{se(stats.dc).reverse().map(([d,c])=><div key={d} className="flex items-center justify-between"><span className="text-xs text-zinc-400">{d}</span><div className="flex items-center gap-2"><Progress value={pct(c,stats.tl)} className="w-24 h-1.5 bg-zinc-800"/><span className="text-sm font-bold text-amber-500 w-8 text-right">{c}</span></div></div>)}</CardContent></Card>
            <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Key Insights</CardTitle></CardHeader><CardContent className="space-y-2">{[`📍 Top state: ${se(stats.sc)[0]?.[0]} (${se(stats.sc)[0]?.[1]} leads). ${stats.st} states total.`,`🔗 ${stats.ms.matched} leads matched to ${stats.ms.totalDealLinks} deals in database.`,`🔥 ${stats.pc['Quote Submitted']||0} quotes submitted, ${stats.pc['Quote Expected']||0} expected, ${stats.ul} urgent.`,`📦 ${Object.keys(stats.cc).length} product categories identified.`,`⚠️ ${stats.tl-stats.er} leads missing email — can't auto-match.`,`🏆 Top collector: ${se(stats.tmc)[0]?.[0]} (${se(stats.tmc)[0]?.[1]} leads)`].map((t,i)=><p key={i} className="text-[0.75rem] text-zinc-400 leading-relaxed">{t}</p>)}</CardContent></Card>
          </div>
        </>}</TabsContent>

        {/* PIPELINE */}
        <TabsContent value="pipeline" className="mt-4 space-y-6">{stats&&<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(PC).map(([s,c])=>{const n=stats.pc[s]||0;const a=fP===s;return<Card key={s} onClick={()=>sFP(a?null:s)} className={`bg-zinc-900 cursor-pointer text-center ${a?'border-zinc-600':'border-zinc-800 hover:border-zinc-700'}`}><CardContent className="p-3"><div className="w-2 h-2 rounded-full mx-auto mb-1" style={{background:c}}/><div className="text-[0.58rem] font-bold uppercase tracking-wider text-zinc-600">{s}</div><div className="text-xl font-extrabold mt-0.5" style={{color:c}}>{n}</div><div className="text-[0.6rem] text-zinc-700">{pct(n,stats.tl)}%</div></CardContent></Card>})}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pipeline</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={se(stats.pc).map(([k,v])=>({name:k,value:v}))} dataKey="value" cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={2}>{se(stats.pc).map(([k],i)=><Cell key={i} fill={PC[k]||COLORS[i]} stroke="#09090b"/>)}</Pie><Tooltip contentStyle={{background:'#262626',border:'none',borderRadius:8,fontSize:'0.75rem',color:'#f5f5f5'}}/><Legend wrapperStyle={{fontSize:'0.6rem'}}/></PieChart></ResponsiveContainer></CardContent></Card>
            <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Business Types</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={280}><BarChart data={se(stats.bc).map(([k,v])=>({name:k,count:v}))} layout="vertical" margin={{left:10,right:20}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/><XAxis type="number" tick={{fill:'#666',fontSize:10}}/><YAxis type="category" dataKey="name" width={150} tick={{fill:'#888',fontSize:10}}/><Tooltip contentStyle={{background:'#262626',border:'none',borderRadius:8,fontSize:'0.75rem',color:'#f5f5f5'}}/><Bar dataKey="count" fill={GOLD} radius={[0,4,4,0]} maxBarSize={18}/></BarChart></ResponsiveContainer></CardContent></Card>
          </div>
          <ST results={filtered} onSelect={sSel}/>
        </>}</TabsContent>

        {/* LIVE DEALS */}
        <TabsContent value="live_deals" className="mt-4 space-y-6">{stats&&<>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Total Deals" value={stats.td} sub="in Supabase" accent/><KPI label="Submissions" value={stats.tfs} sub="raw intake"/><KPI label="Lead Matches" value={stats.ms.matched} sub={`${pct(stats.ms.matched,stats.tl)}% of leads`}/>
            <KPI label="Active from Shows" value={stats.ms.withActiveDeals} sub="in pipeline"/><KPI label="Revenue" value={fc(stats.tr)} sub="recovery"/><KPI label="Commission" value={fc(stats.tc)} sub="earned"/>
          </div>
          <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Deal Stages (All)</CardTitle></CardHeader><CardContent><div className="grid grid-cols-3 md:grid-cols-5 gap-2">{Object.entries(DSL).map(([s,l])=>{const n=stats.dsc[s]||0;return<div key={s} className="text-center p-2 rounded-lg bg-zinc-950"><div className="text-lg font-extrabold" style={{color:DSC[s]}}>{n}</div><div className="text-[0.58rem] font-semibold text-zinc-500 mt-0.5">{l}</div></div>})}</div></CardContent></Card>
          <h3 className="text-sm font-bold text-amber-500 pb-2 border-b border-zinc-800">Trade Show Leads → Live Deals</h3>
          <ST results={mr.filter(r=>r.confidence!=='none'&&(!fS||r.lead.show_name===fS))} onSelect={sSel}/>
          {fs.length>0&&<><h3 className="text-sm font-bold text-amber-500 pb-2 border-b border-zinc-800">Recent Submissions ({fs.length})</h3>
            <Card className="bg-zinc-900 border-zinc-800"><ScrollArea className="max-h-[350px]"><Table><TableHeader><TableRow className="border-zinc-800">{['Submitted','Company','Contact','Email','Item','Qty','Status'].map(h=><TableHead key={h} className="text-[0.6rem] font-bold uppercase text-zinc-600">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{fs.slice(0,50).map(s=><TableRow key={s.id} className="border-zinc-800/50"><TableCell className="text-[0.7rem] text-zinc-500">{fd(s.submitted_at)}</TableCell><TableCell className="text-[0.7rem] text-zinc-200 font-medium">{s.company_name||'—'}</TableCell><TableCell className="text-[0.7rem] text-zinc-400">{s.contact_name||'—'}</TableCell><TableCell className="text-[0.7rem] text-zinc-500">{s.email||'—'}</TableCell><TableCell className="text-[0.7rem] text-zinc-400 max-w-[200px] truncate">{s.item_name||'—'}</TableCell><TableCell className="text-[0.7rem] text-zinc-500">{s.quantity||'—'}</TableCell><TableCell><Badge variant="outline" className={`text-[0.55rem] ${s.processed?'text-green-500 border-green-800':'text-amber-500 border-amber-800'}`}>{s.processed?'Processed':'Pending'}</Badge></TableCell></TableRow>)}</TableBody></Table></ScrollArea></Card>
          </>}
        </>}</TabsContent>

        <TabsContent value="market" className="mt-4 space-y-6">{stats&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">States ({stats.st})</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={Math.max(300,Object.keys(stats.sc).length*22)}><BarChart data={se(stats.sc).map(([k,v])=>({name:k,count:v}))} layout="vertical" margin={{left:5,right:15}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/><XAxis type="number" tick={{fill:'#666',fontSize:10}}/><YAxis type="category" dataKey="name" width={35} tick={{fill:'#888',fontSize:10}}/><Tooltip contentStyle={{background:'#262626',border:'none',borderRadius:8,fontSize:'0.75rem',color:'#f5f5f5'}}/><Bar dataKey="count" fill={GOLD} radius={[0,4,4,0]} maxBarSize={16}/></BarChart></ResponsiveContainer></CardContent></Card>
          <Card className="bg-zinc-900 border-zinc-800"><CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Cities ({stats.ci})</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={se(stats.ctc).slice(0,15).map(([k,v])=>({name:k,count:v}))} layout="vertical" margin={{left:5,right:15}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/><XAxis type="number" tick={{fill:'#666',fontSize:10}}/><YAxis type="category" dataKey="name" width={110} tick={{fill:'#888',fontSize:10}}/><Tooltip contentStyle={{background:'#262626',border:'none',borderRadius:8,fontSize:'0.75rem',color:'#f5f5f5'}}/><Bar dataKey="count" fill="#e8c84a" radius={[0,4,4,0]} maxBarSize={16}/></BarChart></ResponsiveContainer></CardContent></Card>
        </div>}</TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-6">{stats&&<>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{se(stats.cc).map(([c,n],i)=>{const a=fC===c;return<Card key={c} onClick={()=>sFC(a?null:c)} className={`bg-zinc-900 cursor-pointer ${a?'border-zinc-600':'border-zinc-800 hover:border-zinc-700'}`}><CardContent className="p-3"><div className="flex justify-between items-center"><span className="text-xs font-semibold text-zinc-300">{c}</span><span className="text-xl font-extrabold" style={{color:COLORS[i%COLORS.length]}}>{n}</span></div><Progress value={pct(n,stats.tl)} className="h-1 mt-2 bg-zinc-800"/><span className="text-[0.6rem] text-zinc-600 mt-1">{pct(n,stats.tl)}%</span></CardContent></Card>})}</div>
          {iF&&<ST results={filtered} onSelect={sSel}/>}
        </>}</TabsContent>

        <TabsContent value="team" className="mt-4 space-y-6">{stats&&<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{se(stats.tmc).map(([n,c],i)=><Card key={n} className="bg-zinc-900 border-zinc-800 text-center"><CardContent className="p-4"><div className="text-3xl font-extrabold" style={{color:i===0?GOLD:'#f5f5f5'}}>{c}</div><div className="text-sm font-semibold text-zinc-300 mt-1">{n}</div><div className="text-[0.65rem] text-zinc-600">{pct(c,stats.tl)}%</div><Progress value={pct(c,stats.tl)} className="h-1.5 mt-3 bg-zinc-800"/></CardContent></Card>)}</div>}</TabsContent>

        <TabsContent value="quality" className="mt-4 space-y-6">{stats&&<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {['full_name','title','company','email','phone','website','city','state','inventory_type','estimated_volume'].map(f=>{const src=fS?leads.filter(l=>l.show_name===fS):leads;const fl=src.filter((l:any)=>l[f]).length;const p=pct(fl,stats.tl);const c=p>=80?'#5cb85c':p>=50?GOLD:'#d9534f';return<Card key={f} className="bg-zinc-900 border-zinc-800"><CardContent className="p-3"><p className="text-[0.6rem] font-bold uppercase tracking-wider text-zinc-600">{f.replace(/_/g,' ')}</p><p className="text-xl font-extrabold mt-1" style={{color:c}}>{p}%</p><p className="text-[0.6rem] text-zinc-600">{fl} of {stats.tl}</p><Progress value={p} className="h-1 mt-2 bg-zinc-800"/></CardContent></Card>})}
        </div>}</TabsContent>

        <TabsContent value="directory" className="mt-4"><ST results={filtered} onSelect={sSel}/></TabsContent>

        <TabsContent value="action" className="mt-4 space-y-6">
          <h3 className="text-sm font-bold text-red-400 pb-2 border-b border-zinc-800">🔥 Urgent ({filtered.filter(r=>r.lead.urgency==='High').length})</h3>
          <ST results={filtered.filter(r=>r.lead.urgency==='High')} onSelect={sSel}/>
          <h3 className="text-sm font-bold text-amber-500 pb-2 border-b border-zinc-800">⏳ Quote Expected, No Match ({filtered.filter(r=>r.confidence==='none'&&['Quote Expected','Quote Submitted'].includes(r.lead.pipeline_stage)).length})</h3>
          <ST results={filtered.filter(r=>r.confidence==='none'&&['Quote Expected','Quote Submitted'].includes(r.lead.pipeline_stage))} onSelect={sSel}/>
          <h3 className="text-sm font-bold text-zinc-400 pb-2 border-b border-zinc-800">⚠️ Missing Email ({filtered.filter(r=>!r.lead.email).length})</h3>
          <ST results={filtered.filter(r=>!r.lead.email)} onSelect={sSel}/>
        </TabsContent>

      </Tabs></div>
      <LeadDrawer result={sel} onClose={()=>sSel(null)}/>
      <footer className="border-t border-amber-900/30 mt-12 py-4 text-center"><p className="text-zinc-700 text-[0.65rem]">© 2026 The Stuff Buyers LLC · Internal · Live DB</p></footer>
    </div>
  )
}
