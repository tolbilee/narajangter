import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // CORS preflight 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200 
    })
  }

  try {
    console.log('🚀 나라장터 API 데이터 수집 시작...')

    // 환경 변수에서 설정 가져오기
    const G2B_API_KEY = Deno.env.get('G2B_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    console.log('환경 변수 확인:', {
      hasApiKey: !!G2B_API_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_KEY
    })

    if (!G2B_API_KEY) {
      throw new Error('G2B_API_KEY가 설정되지 않았습니다')
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase 환경 변수가 설정되지 않았습니다')
    }

    // Supabase 클라이언트 초기화 (service_role 권한)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 날짜 계산 (최근 30일)
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

    console.log(`📅 검색 기간: ${inqryBgnDt} ~ ${inqryEndDt}`)

    // 나라장터 API URL 구성
    const g2bUrl = `https://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServc04` +
      `?serviceKey=${encodeURIComponent(G2B_API_KEY)}` +
      `&inqryBgnDt=${inqryBgnDt}` +
      `&inqryEndDt=${inqryEndDt}` +
      `&numOfRows=100` +
      `&pageNo=1` +
      `&type=json`

    console.log('🌐 나라장터 API 호출 중...')

    // API 호출
    const response = await fetch(g2bUrl, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`나라장터 API 호출 실패: ${response.status} ${response.statusText}`)
    }

    const responseText = await response.text()
    
    console.log('📡 API 응답 상태:', response.status)
    console.log('📄 API 응답 (첫 500자):', responseText.substring(0, 500))

    // JSON 파싱
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('❌ JSON 파싱 실패:', e)
      throw new Error('API 응답을 JSON으로 파싱할 수 없습니다: ' + responseText.substring(0, 200))
    }

    // API 응답 확인
    const resultCode = data.response?.header?.resultCode
    const resultMsg = data.response?.header?.resultMsg

    console.log('📊 API 결과 코드:', resultCode)
    console.log('📊 API 결과 메시지:', resultMsg)

    if (resultCode !== '00') {
      throw new Error(`나라장터 API 오류 (${resultCode}): ${resultMsg}`)
    }

    // 데이터 추출
    const items = data.response?.body?.items || []
    
    console.log(`📦 받은 데이터 개수: ${items.length}건`)

    if (items.length === 0) {
      console.log('ℹ️ 새로운 입찰 정보가 없습니다')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '새로운 입찰 정보가 없습니다',
          insertedCount: 0,
          totalItems: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    let insertedCount = 0
    let errorCount = 0
    const errors: string[] = []

    // 각 입찰 공고를 데이터베이스에 저장
    for (const item of items) {
      try {
        // 날짜 포맷 변환 함수
        const convertDate = (dateStr: string): string | null => {
          if (!dateStr || dateStr.length !== 8) return null
          return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`
        }

        const convertDateTime = (dateStr: string, timeStr: string): string | null => {
          if (!dateStr || dateStr.length !== 8) return null
          if (!timeStr || timeStr.length < 4) {
            return convertDate(dateStr) + ' 00:00:00'
          }
          return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)} ${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:00`
        }

        // 금액 파싱
        const parseAmount = (amountStr: any): number => {
          if (!amountStr) return 0
          const cleanedAmount = String(amountStr).replace(/[,\s]/g, '')
          const parsed = parseInt(cleanedAmount)
          return isNaN(parsed) ? 0 : parsed
        }

        // 입찰 데이터 구성
        const bidData = {
          bid_notice_no: item.bidNtceNo || item.bidntceNo || '',
          bid_notice_name: item.bidNtceNm || item.bidntceNm || '',
          bid_notice_org: item.ntceInsttNm || item.ntceInsttNm || '',
          demand_org: item.dminsttNm || item.dmndInsttNm || '',
          notice_date: convertDate(item.bidNtceDt || item.bidntceDt || ''),
          bid_date: convertDateTime(
            item.bidClseDt || item.bidCloseDt || '', 
            item.bidClseTm || item.bidCloseTm || ''
          ),
          contract_type: item.cntrctCnclsMthdNm || item.cntrctMthdNm || item.bidMethdNm || '일반경쟁입찰',
          bid_amount: parseAmount(item.asignBdgtAmt || item.presmptPrce),
          bid_status: '공고중',
          detail_url: item.bidNtceUrl || item.linkUrl || 'https://www.g2b.go.kr',
          description: item.ntceKindNm || item.bidNm || ''
        }

        // 데이터 검증
        if (!bidData.bid_notice_no) {
          console.warn('⚠️ 입찰공고번호가 없는 항목 스킵')
          errorCount++
          continue
        }

        // UPSERT (있으면 업데이트, 없으면 삽입)
        const { error } = await supabase
          .from('bids')
          .upsert(bidData, { 
            onConflict: 'bid_notice_no',
            ignoreDuplicates: false 
          })

        if (error) {
          console.error('❌ 데이터 저장 실패:', bidData.bid_notice_no, error.message)
          errors.push(`${bidData.bid_notice_no}: ${error.message}`)
          errorCount++
        } else {
          insertedCount++
          console.log(`✅ 저장 완료: ${bidData.bid_notice_no} - ${bidData.bid_notice_name}`)
        }
      } catch (itemError: any) {
        console.error('❌ 항목 처리 실패:', itemError.message)
        errors.push(itemError.message)
        errorCount++
      }
    }

    // 결과 요약
    const result = {
      success: true,
      message: `${insertedCount}건의 입찰 정보를 업데이트했습니다${errorCount > 0 ? ` (${errorCount}건 실패)` : ''}`,
      insertedCount,
      errorCount,
      totalItems: items.length,
      dateRange: {
        start: inqryBgnDt,
        end: inqryEndDt
      },
      errors: errorCount > 0 ? errors.slice(0, 5) : []
    }

    console.log('✅ 처리 완료:', result)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    console.error('💥 에러 발생:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200  // CORS 오류 방지를 위해 200 반환
      }
    )
  }
})
