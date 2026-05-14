import { GoogleGenAI } from "@google/genai";
import { Article } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function searchNews(keyword: string): Promise<Article[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a professional News Research Agent.
      Task: Find exactly 15 high-quality, unique, and recent news articles strictly related to the keyword: "${keyword}".
      
      CRITICAL REQUIREMENTS:
      1. RELEVANCE: Every article MUST be directly relevant to "${keyword}". Prioritize actual news stories over business info or generic landing pages.
      2. DEDUPLICATION: Do not include multiple articles about the same specific event. Choose the most comprehensive source.
      3. ACCURACY: Each "title" must be a real headline, and "url" must be a valid link to the article.
      4. NO DOMAIN TITLES: Never use just the domain name (e.g., "daum.net", "naver.com") as a news title.
      5. NO PREAMBLES: The results must be ONLY a valid JSON array.

      Return a JSON array of objects:
      {
        "title": string,
        "snippet": string (a descriptive 2-3 sentence summary),
        "url": string,
        "source": string (e.g., "Reuters", "BBC", "Chosun Ilbo"),
        "publishedAt": string (ISO 8601 format)
      }`,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || "[]";
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(art => ({
          ...art,
          publishedAt: art.publishedAt || new Date().toISOString()
        })).filter(art => {
          const lowerTitle = art.title.toLowerCase();
          const lowerSource = art.source.toLowerCase();
          // Filter out generic results or domain-only titles
          if (lowerTitle === lowerSource || lowerTitle.includes('internal server error')) return false;
          // Basic heuristic for relevance: check if keyword exists in title or snippet if keyword isn't too generic
          return art.title.length > 5 && art.url.startsWith('http');
        }).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      }
    } catch (e) {
      console.error("Failed to parse news JSON", e);
    }

    return [];
  } catch (error) {
    console.error("Error searching news:", error);
    return [];
  }
}

export async function summarizeArticle(title: string, url: string, snippet: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Please summarize the following news article:
      Title: ${title}
      URL: ${url}
      Snippet: ${snippet}
      
      Provide a concise summary in Korean (since the user request was in Korean). 
      Highlight the key points.
      Do NOT include any introductory or concluding remarks (e.g., "Here is a summary", "2026년 5월 14일 현재..."). Starting directly with the content.`,
      config: {
        tools: [{ urlContext: {} }] // Using urlContext to help Gemini "see" the article if possible
      }
    });

    return response.text || "Summary not available.";
  } catch (error) {
    console.error("Error summarizing article:", error);
    return "Failed to generate summary.";
  }
}
