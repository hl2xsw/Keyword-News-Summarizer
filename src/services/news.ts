import { Article } from "../types";

export function cleanNewsUrl(url: string | undefined): string {
  return url || '';
}

export async function searchNews(keyword: string): Promise<{ articles: Article[]; isQuotaExceeded: boolean; isCustomCseFailed?: boolean }> {
  try {
    const customApiKey = typeof window !== "undefined" ? localStorage.getItem("GOOGLE_API_KEY") : null;
    const customCseId = typeof window !== "undefined" ? localStorage.getItem("GOOGLE_CSE_ID") : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (customApiKey) {
      headers["X-Google-Api-Key"] = customApiKey;
    }
    if (customCseId) {
      headers["X-Google-Cse-Id"] = customCseId;
    }

    const response = await fetch("/api/news", {
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
    throw err;
  }
}

export async function briefNews(keyword: string, articles: Article[]): Promise<string> {
  try {
    const response = await fetch("/api/brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
    throw err;
  }
}
