import { Article } from "../types";

export function cleanNewsUrl(url: string | undefined): string {
  return url || '';
}

function extractSourceFromUrl(urlStr: string): string {
  try {
    const domain = new URL(urlStr).hostname.toLowerCase().replace('www.', '');
    if (domain.includes('naver.com')) return '네이버뉴스';
    if (domain.includes('daum.net') || domain.includes('kakao.com')) return '다음뉴스';
    if (domain.includes('yonhapnews')) return '연합뉴스';
    if (domain.includes('hankyung')) return '한국경제';
    if (domain.includes('mk.co.kr')) return '매일경제';
    if (domain.includes('chosun')) return '조선일보';
    if (domain.includes('joongang') || domain.includes('joins')) return '중앙일보';
    if (domain.includes('donga')) return '동아일보';
    if (domain.includes('hani.co.kr')) return '한겨레';
    if (domain.includes('khan.co.kr')) return '경향신문';
    if (domain.includes('kbs.co.kr')) return 'KBS';
    if (domain.includes('imbc.co.kr')) return 'MBC';
    if (domain.includes('sbs.co.kr')) return 'SBS';
    if (domain.includes('ytn.co.kr')) return 'YTN';
    if (domain.includes('news1')) return '뉴스1';
    if (domain.includes('newsis')) return '뉴시스';
    if (domain.includes('etnews')) return '전자신문';
    if (domain.includes('sedaily')) return '서울경제';
    if (domain.includes('moneytoday') || domain.includes('mt.co.kr')) return '머니투데이';
    if (domain.includes('asiae.co.kr')) return '아시아경제';
    if (domain.includes('edaily.co.kr')) return '이데일리';
    if (domain.includes('fnnews.com')) return '파이낸셜뉴스';
    if (domain.includes('heraldcorp.com') || domain.includes('heraldbiz.com')) return '헤럴드경제';
    if (domain.includes('seoul.co.kr')) return '서울신문';
    if (domain.includes('munhwa.com')) return '문화일보';
    if (domain.includes('segye.com')) return '세계일보';
    if (domain.includes('kmib.co.kr')) return '국민일보';
    if (domain.includes('hankookilbo.com')) return '한국일보';
    if (domain.includes('nocutnews.co.kr')) return '노컷뉴스';
    if (domain.includes('dt.co.kr')) return '디지털타임스';
    if (domain.includes('ddaily.co.kr')) return '디지털데일리';
    if (domain.includes('inews24.com')) return '아이뉴스24';
    
    const parts = domain.split('.');
    if (parts.length > 1) {
      const name = parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return '뉴스';
  } catch {
    return '뉴스';
  }
}

function sanitizeTitle(title: string): string {
  if (!title) return '';
  let clean = title.trim();
  const suffixes = [
    ' : 네이버 뉴스', ' : 네이트 뉴스', ' : 다음 뉴스', ' - ZDNet kor', 
    ' | Chosun Biz', ' - Chosun Biz', ' - 동아일보', ' | 매일경제',
    ' - 한국경제', ' - 조선일보', ' - 중앙일보', ' - 한겨레', ' - 경향신문',
    ' - YTN', ' - MBN', ' - SBS Biz', ' - SBS', ' - MBC', ' - KBS',
    ' - 연합뉴스', ' - 서울경제', ' - 머니투데이', ' - 아시아경제'
  ];
  for (const suffix of suffixes) {
    if (clean.endsWith(suffix)) {
      clean = clean.slice(0, clean.length - suffix.length);
    }
  }
  return clean;
}

export async function searchNews(keyword: string): Promise<{ articles: Article[]; isQuotaExceeded: boolean; isCustomCseFailed?: boolean }> {
  const customApiKey = typeof window !== "undefined" ? localStorage.getItem("GOOGLE_API_KEY") : null;
  const customCseId = typeof window !== "undefined" ? localStorage.getItem("GOOGLE_CSE_ID") : null;
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || "";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (customApiKey) {
      headers["X-Google-Api-Key"] = customApiKey;
    }
    if (customCseId) {
      headers["X-Google-Cse-Id"] = customCseId;
    }

    const response = await fetch(`${apiBase}/api/news`, {
      method: "POST",
      headers,
      body: JSON.stringify({ keyword }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Search failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.log("[Notice] Client news search action logged.", err);

    // Client-side Direct custom CSE fallback if backend is down or not found (e.g. Netlify static serverless runtime)
    if (customApiKey && customCseId) {
      try {
        console.log("[Direct Client Search] Querying official Google Custom Search API directly from browser fallback...");
        const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(customApiKey)}&cx=${encodeURIComponent(customCseId)}&q=${encodeURIComponent(keyword)}&num=10`;
        const cseRes = await fetch(cseUrl);
        if (cseRes.ok) {
          const data = await cseRes.json();
          const items = data.items || [];
          const articles: Article[] = items.map((item: any) => {
            const rawUrl = item.link || '';
            const rawTitle = item.title || '';
            const snippet = item.snippet || '';
            const dateStr = item.pagemap?.metatags?.[0]?.['article:published_time'] || 
                            item.pagemap?.metatags?.[0]?.['date'] || 
                            item.pagemap?.metatags?.[0]?.['pubdate'] || 
                            '';
            return {
              title: sanitizeTitle(rawTitle),
              snippet,
              url: rawUrl,
              source: extractSourceFromUrl(rawUrl),
              publishedAt: dateStr ? new Date(dateStr).toLocaleDateString('ko-KR') : '실시간'
            };
          }).filter((art: Article) => art.title && art.url);

          return {
            articles,
            isQuotaExceeded: false,
            isCustomCseFailed: false
          };
        }
      } catch (directSearchErr) {
        console.log("[Notice] Client-side direct Google CSE fallback faced connectivity issues.", directSearchErr);
      }
    }

    throw err;
  }
}

export async function briefNews(keyword: string, articles: Article[]): Promise<string> {
  const customApiKey = typeof window !== "undefined" ? localStorage.getItem("GOOGLE_API_KEY") : null;
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || "";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (customApiKey) {
      headers["X-Google-Api-Key"] = customApiKey;
    }

    const response = await fetch(`${apiBase}/api/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({ keyword, articles }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Briefing failed with status: ${response.status}`);
    }

    const data = await response.json();
    return data.brief;
  } catch (err) {
    console.log("[Notice] Client news briefing action logged.", err);

    // Client-side Direct standard Gemini 2.5 flash fallback if API is not hosted or 404 (Netlify)
    if (customApiKey) {
      try {
        console.log("[Direct Client Briefing] Generating briefing via direct browser Gemini API endpoint fallback...");
        // Call the official endpoint directly from the browser
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(customApiKey)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `당신은 최인접 실시간 글로벌 뉴스 트렌드와 미디어 소식을 심층 분석하는 인텔리전스 AI 요약 분석관입니다. 
                    
                    주어진 검색어 키워드 ["${keyword}"]에 대응하여 수집된 최신 뉴스 기사들의 제목과 스니펫 목록을 바탕으로, 현재 전개되고 있는 트렌드의 핵심 맥락과 중요한 발전 추이를 명료하고 가독성 높게 한글로 종합 브리핑해 주십시오.

                    각 개별 기사를 파편적으로 나열하지 말고, 전체 보도들을 거시적으로 관통하는 핵심 줄거리와 특징적 시사점을 도출해 주십시오. 
                    읽는 이에게 신뢰와 통찰을 전달할 수 있도록 전문적인 문체로 작성해 주시기 바랍니다.

                    수집된 기사 정보:
                    ${articles.map((art, idx) => `[기사 ${idx + 1}] 제목: ${art.title}\n출처: ${art.source}\n요약문: ${art.snippet}`).join('\n\n')}
                    `
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000
            }
          })
        });

        if (response.ok) {
          const geminiData = await response.json();
          const briefText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (briefText) {
            return briefText;
          }
        }
      } catch (directBriefErr) {
        console.log("[Notice] Client-side direct browser Gemini briefing faced connectivity issues.", directBriefErr);
      }
    }

    // Secondary fallback summary generator
    const listText = articles.slice(0, 3).map((art, idx) => `${idx + 1}. ${art.title}`).join('\n');
    return `실시간 인텔리전스 로컬 가동 브리핑입니다.\n\n현재 "${keyword}" 분야는 국내외 주요 언론들의 실시간 최신 보도로 주요 관심사로 관측되었습니다.\n\n수집된 주요 헤드라인:\n${listText}\n\n전망: 관련 상황의 동향을 지속 관측할 필요가 있으며, 향후 시장의 판세와 참여 주체들의 공식 대응에 따라 주요 전개 방향이 확립될 것입니다.`;
  }
}
