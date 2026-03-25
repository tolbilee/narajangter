import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type G2BAttemptResult = {
  endpoint: string
  encodedKey: boolean
  keyParamName: string
  pageNo?: number
  httpStatus: number
  resultCode?: string
  resultMsg?: string
  responseSnippet?: string
}

type G2BSuccess = {
  endpoint: string
  encodedKey: boolean
  keyParamName: string
  pageNo: number
  data: any
  attempts: G2BAttemptResult[]
}

function formatDateTimeCompact(date: Date, endOfDay = false): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hh = endOfDay ? '23' : '00'
  const mm = endOfDay ? '59' : '00'
  return `${year}${month}${day}${hh}${mm}`
}

function buildG2BUrl(
  endpointPath: string,
  apiKey: string,
  inqryBgnDt: string,
  inqryEndDt: string,
  encodedKey: boolean,
  keyParamName: string,
  pageNo = 1,
  numOfRows = 100,
): string {
  const serviceKeyValue = encodedKey ? encodeURIComponent(apiKey) : apiKey

  if (endpointPath.includes('BidPublicInfoService')) {
    return `https://apis.data.go.kr/1230000/${endpointPath}` +
      `?${keyParamName}=${serviceKeyValue}` +
      `&inqryDiv=1` +
      `&inqryBgnDt=${inqryBgnDt}` +
      `&inqryEndDt=${inqryEndDt}` +
      `&numOfRows=${numOfRows}` +
      `&pageNo=${pageNo}` +
      `&type=json`
  }

  return `https://apis.data.go.kr/1230000/${endpointPath}` +
    `?${keyParamName}=${serviceKeyValue}` +
    `&bidNtceBgnDt=${inqryBgnDt}` +
    `&bidNtceEndDt=${inqryEndDt}` +
    `&numOfRows=${numOfRows}` +
    `&pageNo=${pageNo}` +
    `&type=json`
}

function extractTotalCount(data: any): number {
  const body = data?.response?.body
  const candidates = [body?.totalCount, body?.totCnt, body?.totalCnt]
  for (const value of candidates) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function extractHeader(data: any): { resultCode?: string, resultMsg?: string } {
  const responseHeader = data?.response?.header
  if (responseHeader?.resultCode) {
    return {
      resultCode: String(responseHeader.resultCode),
      resultMsg: responseHeader.resultMsg ? String(responseHeader.resultMsg) : undefined,
    }
  }

  const nkErrorHeader = data?.['nkoneps.com.response.ResponseError']?.header
  if (nkErrorHeader?.resultCode) {
    return {
      resultCode: String(nkErrorHeader.resultCode),
      resultMsg: nkErrorHeader.resultMsg ? String(nkErrorHeader.resultMsg) : undefined,
    }
  }

  return {}
}

function normalizeItems(rawItems: any): any[] {
  if (!rawItems) return []
  if (Array.isArray(rawItems)) return rawItems
  if (Array.isArray(rawItems.item)) return rawItems.item
  if (rawItems.item && typeof rawItems.item === 'object') return [rawItems.item]
  if (typeof rawItems === 'object') return [rawItems]
  return []
}

function dedupeItemsByBidNotice(items: any[]): any[] {
  const map = new Map<string, any>()
  for (const item of items) {
    const key = String(item?.bidNtceNo || item?.bidntceNo || '')
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  return Array.from(map.values())
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function createDayWindow(today: Date, dayOffset: number): { dayBgn: string, dayEnd: string } {
  const targetDate = new Date(today.getTime() - (dayOffset * 24 * 60 * 60 * 1000))
  return {
    dayBgn: formatDateTimeCompact(targetDate, false),
    dayEnd: formatDateTimeCompact(targetDate, true),
  }
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function callG2BWithFallbacks(
  apiKey: string,
  inqryBgnDt: string,
  inqryEndDt: string,
  pageNo = 1,
  numOfRows = 100,
): Promise<G2BSuccess> {
  const endpoints = [
    'ad/BidPublicInfoService04/getBidPblancListInfoServc04',
    'ad/BidPublicInfoService/getBidPblancListInfoServc',
    'ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo',
    'PubDataOpnStdService/getDataSetOpnStdBidPblancInfo',
  ]
  const keyModes = [true, false]
  const keyParamNames = ['serviceKey', 'ServiceKey']
  const attempts: G2BAttemptResult[] = []

  for (const endpoint of endpoints) {
    for (const encodedKey of keyModes) {
      for (const keyParamName of keyParamNames) {
        const url = buildG2BUrl(endpoint, apiKey, inqryBgnDt, inqryEndDt, encodedKey, keyParamName, pageNo, numOfRows)
        let httpStatus = 0
        try {
          const response = await fetch(url, { headers: { 'Accept': 'application/json' } })
          httpStatus = response.status
          const responseText = await response.text()
          const responseSnippet = responseText.replace(/\s+/g, ' ').slice(0, 240)

          if (!response.ok) {
            attempts.push({ endpoint, encodedKey, keyParamName, pageNo, httpStatus, responseSnippet })
            continue
          }

          let data: any
          try {
            data = JSON.parse(responseText)
          } catch {
            attempts.push({ endpoint, encodedKey, keyParamName, pageNo, httpStatus, resultMsg: 'JSON parse failed', responseSnippet })
            continue
          }

          const { resultCode, resultMsg } = extractHeader(data)
          attempts.push({ endpoint, encodedKey, keyParamName, pageNo, httpStatus, resultCode, resultMsg, responseSnippet })

          if (resultCode === '00') {
            return { endpoint, encodedKey, keyParamName, pageNo, data, attempts }
          }
        } catch (error: any) {
          attempts.push({
            endpoint,
            encodedKey,
            keyParamName,
            pageNo,
            httpStatus,
            resultMsg: error?.message || 'Fetch failed',
          })
        }
      }
    }
  }

  throw new Error(`G2B request failed on all endpoint/key combinations: ${JSON.stringify(attempts.slice(-12))}`)
}

async function fetchDailyItemsAllPages(
  apiKey: string,
  inqryBgnDt: string,
  inqryEndDt: string,
  numOfRows = 100,
  maxPages = 200,
): Promise<{ dayItems: any[], attempts: G2BAttemptResult[], endpoint: string, encodedKey: boolean }> {
  const first = await callG2BWithFallbacks(apiKey, inqryBgnDt, inqryEndDt, 1, numOfRows)
  const attempts: G2BAttemptResult[] = [...first.attempts.slice(-4)]
  const allItems: any[] = [...normalizeItems(first.data?.response?.body?.items)]

  const totalCount = extractTotalCount(first.data)
  const totalPagesFromCount = totalCount > 0 ? Math.ceil(totalCount / numOfRows) : 0
  const totalPages = totalPagesFromCount > 0 ? Math.min(Math.max(totalPagesFromCount, 1), maxPages) : 0

  if (totalPages > 1) {
    for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
      try {
        const page = await callG2BWithFallbacks(apiKey, inqryBgnDt, inqryEndDt, pageNo, numOfRows)
        const pageItems = normalizeItems(page.data?.response?.body?.items)
        allItems.push(...pageItems)
        attempts.push(...page.attempts.slice(-2))
      } catch (error: any) {
        attempts.push({
          endpoint: first.endpoint,
          encodedKey: first.encodedKey,
          keyParamName: first.keyParamName,
          pageNo,
          httpStatus: 0,
          resultMsg: String(error?.message || 'Page fetch failed').slice(0, 240),
        })
      }
    }
  } else if (totalPages === 0) {
    for (let pageNo = 2; pageNo <= maxPages; pageNo++) {
      try {
        const page = await callG2BWithFallbacks(apiKey, inqryBgnDt, inqryEndDt, pageNo, numOfRows)
        const pageItems = normalizeItems(page.data?.response?.body?.items)
        allItems.push(...pageItems)
        attempts.push(...page.attempts.slice(-2))
        if (pageItems.length < numOfRows) break
      } catch {
        break
      }
    }
  }

  return {
    dayItems: allItems,
    attempts,
    endpoint: first.endpoint,
    encodedKey: first.encodedKey,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
      status: 200,
    })
  }

  try {
    const G2B_API_KEY = Deno.env.get('G2B_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!G2B_API_KEY) throw new Error('Missing G2B_API_KEY')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase environment variables')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    let requestedDays = 7
    let resetAll = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.days === 30 || body?.days === '30') requestedDays = 30
        if (body?.resetAll === true) resetAll = true
      } catch {
        requestedDays = 7
        resetAll = false
      }
    }

    const today = new Date()
    const daysToFetch = requestedDays
    const startDate = new Date(today.getTime() - ((daysToFetch - 1) * 24 * 60 * 60 * 1000))
    const rangeStartDate = formatDateOnly(startDate)
    const rangeEndDate = formatDateOnly(today)
    const allItems: any[] = []
    const debugAttempts: G2BAttemptResult[] = []
    let lastSuccessEndpoint = ''
    let lastSuccessEncoded = true

    const dayOffsets = Array.from({ length: daysToFetch }, (_, i) => i)
    const maxParallel = 3
    const numOfRows = 100
    const maxPages = 200
    for (let start = 0; start < dayOffsets.length; start += maxParallel) {
      const offsetBatch = dayOffsets.slice(start, start + maxParallel)
      const batchResults = await Promise.all(offsetBatch.map(async (offset) => {
        const { dayBgn, dayEnd } = createDayWindow(today, offset)
        try {
          const g2b = await fetchDailyItemsAllPages(G2B_API_KEY, dayBgn, dayEnd, numOfRows, maxPages)
          const dayItems = g2b.dayItems
          return {
            ok: true as const,
            offset,
            dayItems,
            attempts: g2b.attempts.slice(-8),
            endpoint: g2b.endpoint,
            encodedKey: g2b.encodedKey,
          }
        } catch (dayError: any) {
          return {
            ok: false as const,
            offset,
            attempts: [{
              endpoint: `daily-window-${offset}`,
              encodedKey: true,
              keyParamName: 'serviceKey',
              httpStatus: 0,
              resultMsg: String(dayError?.message || 'Daily fetch failed').slice(0, 240),
            } as G2BAttemptResult],
          }
        }
      }))

      for (const result of batchResults) {
        debugAttempts.push(...result.attempts)
        if (result.ok) {
          allItems.push(...result.dayItems)
          lastSuccessEndpoint = result.endpoint
          lastSuccessEncoded = result.encodedKey
        }
      }
    }

    const items = dedupeItemsByBidNotice(allItems)

    if (resetAll) {
      const { error: deleteError } = await supabase
        .from('bids')
        .delete()
        .neq('bid_notice_no', '')
      if (deleteError) {
        throw new Error(`기존 데이터 삭제 실패: ${deleteError.message}`)
      }
    }

    if (!resetAll) {
      const { error: deleteRangeError } = await supabase
        .from('bids')
        .delete()
        .gte('notice_date', rangeStartDate)
        .lte('notice_date', rangeEndDate)
      if (deleteRangeError) {
        throw new Error(`Failed to clear date window: ${deleteRangeError.message}`)
      }
    }

    if (items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: '신규 공고가 없습니다.',
          insertedCount: 0,
          totalItems: 0,
          debug: {
            endpoint: lastSuccessEndpoint,
            encodedKey: lastSuccessEncoded,
            attempts: debugAttempts.slice(-12),
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const convertDate = (dateStr: string): string | null => {
      if (!dateStr) return null
      const cleaned = dateStr.replace(/[^0-9]/g, '')
      if (cleaned.length < 8) return null
      return `${cleaned.substring(0,4)}-${cleaned.substring(4,6)}-${cleaned.substring(6,8)}`
    }

    const convertDateTime = (dateStr: string, timeStr: string): string | null => {
      const rawDate = String(dateStr || '')
      const rawTime = String(timeStr || '')

      // e.g. 202503241430, 2025-03-24 14:30
      const mergedDigits = `${rawDate}${rawTime}`.replace(/[^0-9]/g, '')
      if (mergedDigits.length >= 12) {
        const y = mergedDigits.substring(0, 4)
        const m = mergedDigits.substring(4, 6)
        const d = mergedDigits.substring(6, 8)
        const hh = mergedDigits.substring(8, 10)
        const mm = mergedDigits.substring(10, 12)
        return `${y}-${m}-${d} ${hh}:${mm}:00`
      }

      const d = convertDate(rawDate)
      if (!d) return null

      const cleanedTime = rawTime.replace(/[^0-9]/g, '')
      if (cleanedTime.length >= 4) {
        return `${d} ${cleanedTime.substring(0,2)}:${cleanedTime.substring(2,4)}:00`
      }

      return `${d} 00:00:00`
    }

    const parseAmount = (amountStr: any): number => {
      if (!amountStr) return 0
      const cleanedAmount = String(amountStr).replace(/[,\s]/g, '')
      const parsed = parseInt(cleanedAmount, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    }

    const bidRows = items
      .map((item) => ({
        bid_notice_no: item.bidNtceNo || item.bidntceNo || '',
        bid_notice_name: item.bidNtceNm || item.bidntceNm || '',
        bid_notice_org: item.ntceInsttNm || item.ntceInsttNm || '',
        demand_org: item.dminsttNm || item.dmndInsttNm || '',
        notice_date: convertDate(item.bidNtceDt || item.bidntceDt || item.bidNtceDate || ''),
        bid_date: convertDateTime(
          item.bidClseDt || item.bidCloseDt || item.bidClseDate || item.bidCloseDate || '',
          item.bidClseTm || item.bidCloseTm || item.bidClseTime || item.bidCloseTime || ''
        ),
        contract_type: item.cntrctCnclsMthdNm || item.cntrctMthdNm || item.bidMethdNm || 'GENERAL_COMPETITIVE_BID',
        bid_amount: parseAmount(item.asignBdgtAmt || item.presmptPrce),
        bid_status: 'OPEN',
        detail_url: item.bidNtceUrl || item.linkUrl || 'https://www.g2b.go.kr',
        description: item.ntceKindNm || item.bidNm || '',
      }))
      .filter((row) => row.bid_notice_no)

    let insertedCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const batch of chunkArray(bidRows, 200)) {
      const { error } = await supabase
        .from('bids')
        .upsert(batch, {
          onConflict: 'bid_notice_no',
          ignoreDuplicates: false
        })

      if (error) {
        errors.push(error.message)
        errorCount += batch.length
      } else {
        insertedCount += batch.length
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `공고 ${insertedCount}건 저장 완료${errorCount > 0 ? ` (${errorCount}건 실패)` : ''}`,
        insertedCount,
        errorCount,
        totalItems: items.length,
        resetAll,
        dateRange: {
          start: formatDateTimeCompact(startDate, false),
          end: formatDateTimeCompact(today, true),
        },
        errors: errorCount > 0 ? errors.slice(0, 5) : [],
        debug: {
          endpoint: lastSuccessEndpoint,
          encodedKey: lastSuccessEncoded,
          attempts: debugAttempts.slice(-12),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }
})
