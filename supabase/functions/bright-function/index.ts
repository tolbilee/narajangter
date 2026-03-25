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
  httpStatus: number
  resultCode?: string
  resultMsg?: string
  responseSnippet?: string
}

type G2BSuccess = {
  endpoint: string
  encodedKey: boolean
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
): string {
  const serviceKeyValue = encodedKey ? encodeURIComponent(apiKey) : apiKey

  if (endpointPath.includes('BidPublicInfoService')) {
    return `https://apis.data.go.kr/1230000/${endpointPath}` +
      `?${keyParamName}=${serviceKeyValue}` +
      `&inqryDiv=1` +
      `&inqryBgnDt=${inqryBgnDt}` +
      `&inqryEndDt=${inqryEndDt}` +
      `&numOfRows=100` +
      `&pageNo=1` +
      `&type=json`
  }

  return `https://apis.data.go.kr/1230000/${endpointPath}` +
    `?${keyParamName}=${serviceKeyValue}` +
    `&bidNtceBgnDt=${inqryBgnDt}` +
    `&bidNtceEndDt=${inqryEndDt}` +
    `&numOfRows=100` +
    `&pageNo=1` +
    `&type=json`
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

async function callG2BWithFallbacks(
  apiKey: string,
  inqryBgnDt: string,
  inqryEndDt: string,
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
        const url = buildG2BUrl(endpoint, apiKey, inqryBgnDt, inqryEndDt, encodedKey, keyParamName)
        let httpStatus = 0
        try {
          const response = await fetch(url, { headers: { 'Accept': 'application/json' } })
          httpStatus = response.status
          const responseText = await response.text()
          const responseSnippet = responseText.replace(/\s+/g, ' ').slice(0, 240)

          if (!response.ok) {
            attempts.push({ endpoint, encodedKey, keyParamName, httpStatus, responseSnippet })
            continue
          }

          let data: any
          try {
            data = JSON.parse(responseText)
          } catch {
            attempts.push({ endpoint, encodedKey, keyParamName, httpStatus, resultMsg: 'JSON parse failed', responseSnippet })
            continue
          }

          const { resultCode, resultMsg } = extractHeader(data)
          attempts.push({ endpoint, encodedKey, keyParamName, httpStatus, resultCode, resultMsg, responseSnippet })

          if (resultCode === '00') {
            return { endpoint, encodedKey, data, attempts }
          }
        } catch (error: any) {
          attempts.push({
            endpoint,
            encodedKey,
            keyParamName,
            httpStatus,
            resultMsg: error?.message || 'Fetch failed',
          })
        }
      }
    }
  }

  throw new Error(`G2B request failed on all endpoint/key combinations: ${JSON.stringify(attempts.slice(-12))}`)
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
    let resetAll = true
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.days === 30 || body?.days === '30') requestedDays = 30
        if (body?.resetAll === false) resetAll = false
      } catch {
        requestedDays = 7
        resetAll = true
      }
    }

    const today = new Date()
    const daysToFetch = requestedDays
    const allItems: any[] = []
    const debugAttempts: G2BAttemptResult[] = []
    let lastSuccessEndpoint = ''
    let lastSuccessEncoded = true

    for (let i = 0; i < daysToFetch; i++) {
      const targetDate = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000))
      const dayBgn = formatDateTimeCompact(targetDate, false)
      const dayEnd = formatDateTimeCompact(targetDate, true)

      try {
        const g2b = await callG2BWithFallbacks(G2B_API_KEY, dayBgn, dayEnd)
        const dayItems = normalizeItems(g2b.data?.response?.body?.items)
        allItems.push(...dayItems)
        debugAttempts.push(...g2b.attempts.slice(-3))
        lastSuccessEndpoint = g2b.endpoint
        lastSuccessEncoded = g2b.encodedKey
      } catch (dayError: any) {
        debugAttempts.push({
          endpoint: `daily-window-${i}`,
          encodedKey: true,
          keyParamName: 'serviceKey',
          httpStatus: 0,
          resultMsg: String(dayError?.message || 'Daily fetch failed').slice(0, 240),
        })
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
      const d = convertDate(dateStr)
      if (!d) return null
      const cleanedTime = (timeStr || '').replace(/[^0-9]/g, '')
      if (cleanedTime.length < 4) return `${d} 00:00:00`
      return `${d} ${cleanedTime.substring(0,2)}:${cleanedTime.substring(2,4)}:00`
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
        bid_date: convertDateTime(item.bidClseDt || item.bidCloseDt || '', item.bidClseTm || item.bidCloseTm || ''),
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

    const startDate = new Date(today.getTime() - ((daysToFetch - 1) * 24 * 60 * 60 * 1000))

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
