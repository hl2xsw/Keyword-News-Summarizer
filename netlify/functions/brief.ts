import { GoogleGenAI } from "@google/genai";

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

async function generateContentWithRetry(aiClient: GoogleGenAI, params: any, retries = 3, delay = 1000): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await aiClient.models.generateContent(params);
    } catch (err: any) {
      const errMsg = String(err.message || "").toLowerCase();
      if (isQuotaError(err)) {
        throw err;
      }
      const isTransient = 
        err.status === "UNAVAILABLE" || 
        err.code === 503 || 
        errMsg.includes("503") || 
        errMsg.includes("unavailable") ||
        errMsg.includes("temporary") ||
        errMsg.includes("high demand");
      
      if (isTransient && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      } else {
        throw err;
      }
    }
  }
}

export const handler = async (event: any, context: any) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Google-Api-Key",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Only POST requests are supported" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { keyword, articles } = body as { keyword: string; articles: Article[] };

    if (!keyword) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "검색어가 존재하지 않습니다." })
      };
    }

    if (!articles || articles.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ brief: "분석할 뉴스 기사가 없습니다." })
      };
    }

    const headers = event.headers || {};
    const customApiKey = headers["x-google-api-key"] || headers["X-Google-Api-Key"];

    const activeAi = customApiKey && customApiKey.trim() ? new GoogleGenAI({
      apiKey: customApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    }) : ai;

    try {
      const articleSummaryList = articles.slice(0, 8).map((art, idx) => `[${idx+1}] 제목: ${art.title} (출처: ${art.source})`).join('\n');
      const response = await generateContentWithRetry(activeAi, {
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

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ brief: response.text || "뉴스 브리핑 생성에 실패했습니다." })
      };
    } catch (error: any) {
      // Context-aware dynamic fallback generation using actual article titles
      const listText = articles.slice(0, 3).map((art, idx) => `${idx+1}. ${art.title}`).join('\n');
      
      const topArticles = articles.slice(0, 3);
      const firstTitle = topArticles[0]?.title || "";
      const secondTitle = topArticles[1]?.title || "";
      
      let coreIssue = `현재 "${keyword}" 관련 실시간 보도와 대중들의 논의가 주요 이슈로 부각되며 관련 트렌드가 큰 주목을 받고 있습니다.`;
      if (firstTitle) {
        const truncatedTitle = firstTitle.length > 50 ? `${firstTitle.substring(0, 47)}...` : firstTitle;
        coreIssue = `현재 "${keyword}" 테마는 "${truncatedTitle}" 보도를 비롯한 다각적인 언론 관심사를 바탕으로 새로운 국면과 실시간 흐름을 형성해 가고 있습니다.`;
      }

      let prospect = `향후 시장의 판세와 관련 기관 및 이해관계자들의 적극적인 대응 방향에 따라 구체적인 장기 국면이 정립될 전망입니다.`;
      if (secondTitle) {
        const truncatedSecTitle = secondTitle.length > 45 ? `${secondTitle.substring(0, 42)}...` : secondTitle;
        prospect = `앞으로 "${truncatedSecTitle}" 이슈의 추가 보도와 후속 조치의 귀추가 향후 국면을 판단할 중요한 포인트이자 주요 전망이 될 것입니다.`;
      }

      const fallbackBrief = `임시 인텔리전스 브리핑:\n${coreIssue}\n\n주요 전개:\n${listText}\n\n전망: ${prospect}`;
      
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ brief: fallbackBrief })
      };
    }

  } catch (err: any) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: err.message || "Internal server error" })
    };
  }
};
