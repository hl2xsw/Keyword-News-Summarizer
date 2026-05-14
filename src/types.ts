export interface Article {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export interface SearchRecord {
  id?: string;
  keyword: string;
  timestamp: any;
  articles: Article[];
}

export interface SavedSummary {
  id?: string;
  articleUrl: string;
  title: string;
  summary: string;
  timestamp: any;
  userId: string;
}
