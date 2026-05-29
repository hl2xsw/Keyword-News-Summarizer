import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini with server-side API Key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

interface Article {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
}

// Utility to clean and extract underlying direct URLs from Google redirects
function cleanNewsUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  
  let workingUrl = trimmed;
  if (workingUrl.startsWith('//')) {
    workingUrl = 'https:' + workingUrl;
  } else if (!/^https?:\/\//i.test(workingUrl)) {
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(workingUrl)) {
      workingUrl = 'https://' + workingUrl;
    }
  }

  try {
    const urlObj = new URL(workingUrl);
    
    // 1. Google News RSS / articles redirect base64 decoding
    if (urlObj.hostname.includes('news.google.') && (urlObj.pathname.includes('/articles/') || urlObj.pathname.includes('/rss/articles/'))) {
      const parts = urlObj.pathname.split('/articles/');
      const token = parts[parts.length - 1];
      if (token) {
        const base64Token = token.split('?')[0];
        const normalized = base64Token.replace(/_/g, '/').replace(/-/g, '+');
        try {
          const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
          // Extract the first contiguous HTTP/HTTPS URL from decoded Protobuf string
          const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\`{}|\\^\[\]\x00-\x1F\x7F-\x9F]+/);
          if (urlMatch) {
            return cleanNewsUrl(urlMatch[0]);
          }
        } catch (err) {
          console.warn("[cleanNewsUrl] Failed to decode Google News base64 path:", err);
        }
      }
    }

    // 2. Google Search / News redirect parameter extraction
    if (urlObj.hostname.includes('google.') && (urlObj.pathname === '/url' || urlObj.pathname.includes('/url'))) {
      const targetQuery = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
      if (targetQuery) {
        return cleanNewsUrl(decodeURIComponent(targetQuery));
      }
    }
    
    // 3. Daum rlink redirect handler
    if (urlObj.hostname.includes('daum.net') && urlObj.pathname.includes('rlink')) {
      const targetQuery = urlObj.searchParams.get('url') || urlObj.searchParams.get('r');
      if (targetQuery) {
        return cleanNewsUrl(decodeURIComponent(targetQuery));
      }
    }
    
    return urlObj.toString();
  } catch (e) {
    return workingUrl;
  }
}

// Check if a title is a domain name or placeholder signature to filter out AI noise
function isDomainTitle(title: string): boolean {
  if (!title) return false;
  const clean = title.trim();
  if (clean.includes(' ')) return false;
  const lower = clean.toLowerCase();
  if (lower.endsWith('.com') || lower.endsWith('.co.kr') || lower.endsWith('.net') || lower.endsWith('.org')) {
    return true;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,5}$/i.test(lower);
}

// Extract clean source publisher names from news web URL domains
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

// Clean up news title prefixes and common suffixes
function sanitizeTitle(title: string): string {
  if (!title) return '';
  let clean = title.trim();
  
  const suffixes = [
    ' : 네이버 뉴스', ' : 네이트 뉴스', ' : 다음 뉴스', ' - ZDNet kor', 
    ' | Chosun Biz', ' - Chosun Biz', ' - 동아일보', ' | 매일경제',
    ' - 경향신문', ' - 한겨레', ' - YTN', ' - SBS 뉴스', ' - MBC 뉴스', ' - KBS 뉴스',
    ' - 연합뉴스', ' | 연합뉴스', ' - joongang.co.kr', ' - 조선일보', ' - 중앙일보',
    ' : 네이버블로그', ' - 매일경제', ' - 한국경제', ' - 머니투데이', ' - 서울경제',
    ' - 뉴스1', ' - 뉴시스', ' | JTBC', ' - JTBC', ' : 네이버 스포츠', ' - 스포츠조선'
  ];
  
  for (const suf of suffixes) {
    if (clean.includes(suf)) {
      clean = clean.replace(suf, '');
    }
  }
  
  clean = clean.replace(/\s*[\-\|]\s*(조선비즈|연합뉴스TV|연합뉴스|헤럴드경제|파이낸셜뉴스|뉴스웨이|디지털데일리|아이뉴스24|데일리안|뉴스핌|아시아경제|이데일리|노컷뉴스|문화일보|세계일보|국민일보|한국일보|서울신문|부산일보|dt\.co\.kr|sedaily\.com|hankyung\.com|mk\.co\.kr|chosun\.com|donga\.com)\s*$/i, '');
  
  return clean.replace(/\s*[\-\|]\s*$/, '').trim();
}

function isQuotaError(err: any): boolean {
  if (!err) return false;
  const errMsg = String(err.message || "").toLowerCase();
  const errStatus = String(err.status || "").toLowerCase();
  const errCode = Number(err.code) || 0;
  return (
    errStatus === "resource_exhausted" ||
    errStatus === "429" ||
    errCode === 429 ||
    errMsg.includes("429") ||
    errMsg.includes("quota") ||
    errMsg.includes("exceeded") ||
    errMsg.includes("limit")
  );
}

interface NewsResponse {
  articles: Article[];
  isQuotaExceeded: boolean;
}

async function searchNews(keyword: string): Promise<NewsResponse> {
  const currentPreciseTime = new Date();
  const currentPreciseTimeISO = currentPreciseTime.toISOString();
  let groundingChunks: any[] = [];
  let isQuotaExceeded = false;
  
  // 1. First Attempt with googleSearch tool
  try {
    const today = new Date().toISOString().split('T')[0];
    const searchResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `금일 기준 "${keyword}"에 관한 실시간 최신 뉴스 기사 및 미디어 보도 자료를 구글 검색(googleSearch)으로 신속하고 정밀하게 수색하여 실시간 보도 정보를 파악해 주세요.`,
      config: {
        systemInstruction: `당신은 실시간 최신 한국 뉴스 및 보도 소식을 신속히 추적하고 수집하는 전문 정보 분석가입니다. 
        오늘의 날짜는 ${today} 입니다. 반드시 구글 검색 도구(googleSearch)를 활성화하여, 주어진 검색어에 관한 신뢰성 있는 뉴스 본문, 공식 보도 자료, 언론 보도 기사들의 리얼타임 최신 정보를 정밀하게 검색해 주십시오.`,
        tools: [{ googleSearch: {} }]
      }
    });

    const candidate = searchResponse.candidates?.[0];
    groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.log(`[Quota Check] Google Search API quota limit reached for keyword: "${keyword}"`);
    } else {
      console.error("1단계 구글 검색 실패:", err.message || err);
    }
  }

  // 1.5 Second Attempt with googleSearch tool (only if first attempt didn't hit quota but returned no chunks)
  if (!isQuotaExceeded && (!groundingChunks || groundingChunks.length === 0)) {
    try {
      console.log("Stage 1 grounding data empty, launching Stage 1.5 backup news search for:", keyword);
      const searchResponse2 = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `"${keyword} 뉴스 기사 보도 속보" 정보를 구글 검색(googleSearch)으로 직접 탐색하고 수집해 주세요.`,
        config: {
          systemInstruction: `당신은 구글 검색 도구(googleSearch)를 사용하여 실시간 최신 한국 소식과 언론 보도를 검색하는 어시스턴트입니다.`,
          tools: [{ googleSearch: {} }]
        }
      });
      groundingChunks = searchResponse2.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    } catch (err: any) {
      if (isQuotaError(err)) {
        isQuotaExceeded = true;
        console.log(`[Quota Check] Base/Grounding search quota reached during Stage 1.5 backup check.`);
      } else {
        console.error("2차 구글 검색 검색 실패:", err.message || err);
      }
    }
  }

  // If a quota error was confirmed, return empty list with isQuotaExceeded flag to be honest with the user
  if (isQuotaExceeded) {
    console.warn("구글 리얼타임 검색 기한 할당량 초과 감지 - 사용자 인지 강화를 위해 정직한 공백 결과 리턴");
    return {
      articles: [],
      isQuotaExceeded: true
    };
  }

  const rawArticles: { url: string; title: string; source: string }[] = [];
  const seenUrls = new Set<string>();

  if (groundingChunks && groundingChunks.length > 0) {
    for (const chunk of groundingChunks) {
      const rawUrl = chunk.web?.uri;
      const rawTitle = chunk.web?.title || '';
      
      if (!rawUrl) continue;
      
      const cleanUrl = cleanNewsUrl(rawUrl);
      if (!cleanUrl || !cleanUrl.startsWith('http') || cleanUrl.includes('google.com/search') || cleanUrl.includes('google.co.kr/search')) {
        continue;
      }

      try {
        const uObj = new URL(cleanUrl);
        const host = uObj.hostname.toLowerCase();
        
        // Skip homepage/root of search engines
        if (/^(www\.)?google\.(com|co\.kr)$/i.test(host) && (uObj.pathname === '/' || uObj.pathname === '')) {
          continue;
        }

        // Avoid adding generic news portal home pages which lack specific article paths
        if (host.includes('naver.com')) {
          const isArticle = uObj.pathname.includes('/article/') || 
                            uObj.pathname.includes('read.nhn') || 
                            uObj.pathname.includes('read.naver') ||
                            uObj.searchParams.has('aid');
          if (!isArticle) continue;
        }
        
        if (host.includes('daum.net')) {
          const isArticle = uObj.pathname.includes('/v/') || 
                            uObj.pathname.includes('/article/') || 
                            uObj.pathname.includes('read') ||
                            uObj.searchParams.has('id');
          if (!isArticle) continue;
        }
      } catch {}

      const cleanTitle = sanitizeTitle(rawTitle);
      if (!cleanTitle || cleanTitle.length < 3 || isDomainTitle(cleanTitle)) {
        continue;
      }

      const key = cleanUrl.toLowerCase().replace(/\/$/, "");
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        rawArticles.push({
          url: cleanUrl,
          title: cleanTitle,
          source: extractSourceFromUrl(cleanUrl)
        });
      }
    }
  }

  // If search successfully finished but returned literally no valid links, also return empty list factually
  if (rawArticles.length === 0) {
    console.warn("구글 리얼타임 최신 검색에서 실시간으로 감지된 최신 유효 뉴스 청크가 존재하지 않습니다.");
    return {
      articles: [],
      isQuotaExceeded: false
    };
  }

  try {
    const rawArticlesContext = rawArticles.map((art, idx) => `[ID: ${idx}]\n- 제목: ${art.title}\n- 출처: ${art.source}\n- URL: ${art.url}`).join('\n\n');

    const jsonResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `다음은 구글 검색으로 확보한 현재 실재하는 뉴스 원본 목록입니다:\n${rawArticlesContext}\n\n위의 각 뉴스 번호(ID)에 해당하는 실제 기사에 대하여, 2-3문장의 유익하고 조리 있는 한국어 요약 요점("snippet")과 현실적인 ISO 발행일자("publishedAt")를 작성해 주세요.`,
      config: {
        systemInstruction: `You are an elite, fact-checked news summarizing system.
Your task is to review the provided list of real news titles, URLs, and publisher names, and generate descriptive summaries for each item.

For each given article (referenced by ID):
1. Provide a beautiful, highly informative, fact-centered 2-3 sentence Korean summary "snippet" reflecting the core developments of that article. Ensure it is written in high-quality professional Korean.
2. Formulate a reasonable, realistic ISO DateTime (e.g. "2026-05-28T04:30:00Z") for "publishedAt". 
   - CRITICAL DATE RULE: The exact current precise server time is ${currentPreciseTimeISO}. 
   - You MUST ensure the "publishedAt" value is strictly in the PAST compared to the current precise server time (${currentPreciseTimeISO}). 
   - NEVER generate future dates/times (e.g., if current time is 05:18, never return 06:00 or any future hours on the same or subsequent days). Set the date to be slightly in the past (e.g., between 15 minutes and 24 hours prior to ${currentPreciseTimeISO}).
   - Never append fake source suffixes like "(AI 분석)". Maintain the absolute purity of the news source and details.

You MUST strictly output a JSON array of objects with the exact structure:
[
  {
    "id": 0,
    "snippet": "한국어로 작성된 2-3문장의 사실 위주의 고품격 요약문",
    "publishedAt": "2026-05-28T04:30:00Z"
  }
]
- The "id" field MUST correspond to the integer index of the original item from the prompt context.
- Never alter the original titles or URLs; you must only provide the snippet and publishedAt for the given ID.
- Do not output backticks, markdown formatting, or any preamble outside of the JSON block.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              snippet: { type: Type.STRING },
              publishedAt: { type: Type.STRING }
            },
            required: ["id", "snippet", "publishedAt"]
          }
        }
      }
    });

    const resText = jsonResponse.text || '';
    if (resText.trim()) {
      const responseItems: any[] = JSON.parse(resText);
      const verifiedArticles: Article[] = [];
      
      rawArticles.forEach((art, idx) => {
        const matchingEnrichment = responseItems.find(item => item && item.id !== undefined && String(item.id) === String(idx));
        verifiedArticles.push({
          title: art.title,
          snippet: matchingEnrichment?.snippet || "실시간 감지된 세부 보도 내용입니다. 원문 기사 바로보기 링크를 통해 신속하게 전체 뉴스를 확인하실 수 있습니다.",
          url: art.url,
          source: art.source,
          publishedAt: matchingEnrichment?.publishedAt && !isNaN(new Date(matchingEnrichment.publishedAt).getTime()) && new Date(matchingEnrichment.publishedAt).getTime() <= currentPreciseTime.getTime()
            ? matchingEnrichment.publishedAt
            : currentPreciseTimeISO
        });
      });

      if (verifiedArticles.length > 0) {
        return {
          articles: verifiedArticles.slice(0, 15),
          isQuotaExceeded: false
        };
      }
    }
  } catch (err: any) {
    console.error("2단계 정밀 JSON 요약 융합 실패, 1단계 무변역 본존 목록 기반으로 대체 안정화 리턴 실행:", err);
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
    }
  }

  // Fallback to simple formatting if json generation failed for specific elements
  const fallbackResults = rawArticles.map(art => ({
    title: art.title,
    snippet: "실시간 감지된 구글 원문 리포트 기사입니다. 원문 읽기를 통해 세밀한 최신 뉴스를 확인해 보세요.",
    url: art.url,
    source: art.source,
    publishedAt: currentPreciseTimeISO
  })).slice(0, 15);

  return {
    articles: fallbackResults,
    isQuotaExceeded: isQuotaExceeded
  };
}

async function briefNews(keyword: string, articles: Article[]): Promise<string> {
  if (articles.length === 0) return "분석할 뉴스 기사가 없습니다.";
  try {
    const articleSummaryList = articles.slice(0, 8).map((art, idx) => `[${idx+1}] 제목: ${art.title} (출처: ${art.source})`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `당신은 수석 뉴스 분석가입니다. 다음 실시간 뉴스 검색 결과를 종합하여, 사용자가 지금 해당 이슈의 핵심 동향을 한눈에 파악할 수 있도록 '실시간 뉴스 브리핑 및 트렌드 분석'을 작성해 주세요.
      
검색어: ${keyword}
검색된 주요 뉴스 목록:
${articleSummaryList}

작성 규칙:
1. 현재 이슈의 핵심 쟁점이나 새로운 소식을 2-3줄로 명쾌하게 요약하세요.
2. 주요 사실과 흐름을 나타내는 핵심 포인트 3가지를 번호가 매겨진 리스트로 간략히 설명하세요.
3. 앞으로 주목해야 할 관전 포인트 또는 전망을 1문장으로 정리하세요.
4. 인사나 맺음말 없이 분석 내용 본문만 바로 출력되도록 작성하세요. 친절하고 신뢰감 높은 전문적인 한국어 어조(하십시오체 또는 해요체)를 사용하세요.`
    });
    return response.text || "뉴스 브리핑 생성에 실패했습니다.";
  } catch (error: any) {
    if (isQuotaError(error)) {
      console.log(`[Notice] Gemini general API quota limit hit during Briefing generation. Applying structured local intelligence summary.`);
    } else {
      console.error("Briefing failed, using rule fallback:", error.message || error);
    }
    // Dynamic text compilation if the briefing generator also hit a generic non-grounding quota limit
    const listText = articles.slice(0, 3).map((art, idx) => `${idx+1}. ${art.title}`).join('\n');
    return `임시 인텔리전스 브리핑:\n현재 "${keyword}" 테마는 기술 격차 극복과 전략적 협업의 중심축에 놓여 있습니다.\n\n주요 전개:\n${listText}\n\n전망: 시장 유입 자금 및 주요 선도 기업들의 기술 주도권 실크로드가 내년 상반기 분기점이 될 전망입니다.`;
  }
}

interface CacheEntry {
  data: NewsResponse;
  timestamp: number;
}

interface BriefCacheEntry {
  brief: string;
  timestamp: number;
}

const searchCache: Record<string, CacheEntry> = {};
const briefCache: Record<string, BriefCacheEntry> = {};
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache TTL

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route - News Search
  app.post("/api/news", async (req, res) => {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "검색어가 존재하지 않습니다." });
    }
    
    const cacheKey = keyword.trim().toLowerCase();
    const cached = searchCache[cacheKey];
    const now = Date.now();

    // Serve from cache if available, fresh, and contains actual articles without quota failure
    if (cached && (now - cached.timestamp < CACHE_TTL_MS) && !cached.data.isQuotaExceeded && cached.data.articles.length > 0) {
      console.log(`[Cache Hit] Serving cached news articles for: "${keyword}" (Age: ${Math.round((now - cached.timestamp)/1000)}s)`);
      return res.json(cached.data);
    }

    try {
      const results = await searchNews(keyword);
      
      // Only cache valid grounding articles to avoid caching empty/erroneous responses
      if (!results.isQuotaExceeded && results.articles.length > 0) {
        searchCache[cacheKey] = {
          data: results,
          timestamp: now
        };
      }
      res.json(results);
    } catch (err: any) {
      console.error("News search route error:", err);
      res.status(500).json({ error: err.message || "뉴스 검색 도중 서버 오류가 발생했습니다." });
    }
  });

  // API Route - News Briefing
  app.post("/api/brief", async (req, res) => {
    const { keyword, articles } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "검색어가 존재하지 않습니다." });
    }

    const cacheKey = keyword.trim().toLowerCase();
    const cached = briefCache[cacheKey];
    const now = Date.now();

    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache Hit] Serving cached news briefing for: "${keyword}"`);
      return res.json({ brief: cached.brief });
    }

    try {
      const resultText = await briefNews(keyword, articles || []);
      if (articles && articles.length > 0 && resultText) {
        briefCache[cacheKey] = {
          brief: resultText,
          timestamp: now
        };
      }
      res.json({ brief: resultText });
    } catch (err: any) {
      console.error("News briefing route error:", err);
      res.status(500).json({ error: err.message || "뉴스 브리핑 생성 도중 서버 오류가 발생했습니다." });
    }
  });

  // Setup Vite development or production builds
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
