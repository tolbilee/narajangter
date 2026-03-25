import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
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

    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000))
    const formatDate = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}${month}${day}`
    }

    const inqryBgnDt = formatDate(thirtyDaysAgo)
    const inqryEndDt = formatDate(today)

    const g2bUrl = `https://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServc04` +
      `?serviceKey=${encodeURIComponent(G2B_API_KEY)}` +
      `&inqryBgnDt=${inqryBgnDt}` +
      `&inqryEndDt=${inqryEndDt}` +
      `&numOfRows=100` +
      `&pageNo=1` +
      `&type=json`

    const response = await fetch(g2bUrl, {
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) throw new Error(`G2B API failed: ${response.status} ${response.statusText}`)

    const responseText = await response.text()
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new Error('Failed to parse G2B JSON response')
    }

    const resultCode = data.response?.header?.resultCode
    const resultMsg = data.response?.header?.resultMsg
    if (resultCode !== '00') throw new Error(`G2B API error (${resultCode}): ${resultMsg}`)

    const items = data.response?.body?.items || []
    if (items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No new bid notices',
          insertedCount: 0,
          totalItems: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const convertDate = (dateStr: string): string | null => {
      if (!dateStr || dateStr.length !== 8) return null
      return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`
    }

    const convertDateTime = (dateStr: string, timeStr: string): string | null => {
      if (!dateStr || dateStr.length !== 8) return null
      if (!timeStr || timeStr.length < 4) return `${convertDate(dateStr)} 00:00:00`
      return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)} ${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:00`
    }

    const parseAmount = (amountStr: any): number => {
      if (!amountStr) return 0
      const cleanedAmount = String(amountStr).replace(/[,\s]/g, '')
      const parsed = parseInt(cleanedAmount, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    }

    let insertedCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of items) {
      try {
        const bidData = {
          bid_notice_no: item.bidNtceNo || item.bidntceNo || '',
          bid_notice_name: item.bidNtceNm || item.bidntceNm || '',
          bid_notice_org: item.ntceInsttNm || item.ntceInsttNm || '',
          demand_org: item.dminsttNm || item.dmndInsttNm || '',
          notice_date: convertDate(item.bidNtceDt || item.bidntceDt || ''),
          bid_date: convertDateTime(item.bidClseDt || item.bidCloseDt || '', item.bidClseTm || item.bidCloseTm || ''),
          contract_type: item.cntrctCnclsMthdNm || item.cntrctMthdNm || item.bidMethdNm || 'GENERAL_COMPETITIVE_BID',
          bid_amount: parseAmount(item.asignBdgtAmt || item.presmptPrce),
          bid_status: 'OPEN',
          detail_url: item.bidNtceUrl || item.linkUrl || 'https://www.g2b.go.kr',
          description: item.ntceKindNm || item.bidNm || ''
        }

        if (!bidData.bid_notice_no) {
          errorCount++
          continue
        }

        const { error } = await supabase
          .from('bids')
          .upsert(bidData, {
            onConflict: 'bid_notice_no',
            ignoreDuplicates: false
          })

        if (error) {
          errors.push(`${bidData.bid_notice_no}: ${error.message}`)
          errorCount++
        } else {
          insertedCount++
        }
      } catch (itemError: any) {
        errors.push(itemError.message)
        errorCount++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${insertedCount} notices updated${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        insertedCount,
        errorCount,
        totalItems: items.length,
        dateRange: { start: inqryBgnDt, end: inqryEndDt },
        errors: errorCount > 0 ? errors.slice(0, 5) : []
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
        details: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }
})
