/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Search, 
  History, 
  Bookmark, 
  ChevronRight, 
  Loader2, 
  Newspaper,
  Calendar,
  X,
  Share2,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { subDays, format, isSameDay } from 'date-fns';
import ReactMarkdown from 'react-markdown';

import { db, auth, signIn, signOut } from './lib/firebase';
import { Article, SearchRecord, SavedSummary } from './types';
import { searchNews, summarizeArticle } from './services/news';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'history' | 'saved'>('search');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  // State for inline summaries per article URL
  const [inlineSummaries, setInlineSummaries] = useState<Record<string, { text: string; loading: boolean }>>({});

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        fetchHistory();
        fetchSavedSummaries();
      }
    });
    // Auto-fetch today's news
    handleSearch(null, "오늘의 주요 뉴스");
    return unsubscribe;
  }, []);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    const threeDaysAgo = subDays(new Date(), 3);
    const q = query(
      collection(db, 'searches'),
      where('userId', '==', auth.currentUser.uid),
      where('timestamp', '>=', threeDaysAgo),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SearchRecord[];
    setHistory(records);
  };

  const fetchSavedSummaries = async () => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'summaries'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SavedSummary[];
    setSavedSummaries(records);
  };

  const handleSearch = async (e: React.FormEvent | null, forcedKeyword?: string) => {
    if (e) e.preventDefault();
    const queryTerm = forcedKeyword || keyword;
    if (!queryTerm.trim()) return;

    setIsSearching(true);
    // Only clear search results if it's a new explicit search
    if (!forcedKeyword) setSearchResults([]);
    
    try {
      const results = await searchNews(queryTerm);
      setSearchResults(results);
      
      if (user && results.length > 0 && !forcedKeyword) {
        await addDoc(collection(db, 'searches'), {
          keyword: queryTerm,
          articles: results,
          timestamp: serverTimestamp(),
          userId: user.uid
        });
        fetchHistory();
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInlineSummarize = async (article: Article) => {
    if (inlineSummaries[article.url]?.text) {
      // Already have it, toggle or keep
      return;
    }

    setInlineSummaries(prev => ({
      ...prev,
      [article.url]: { text: '', loading: true }
    }));
    
    try {
      const result = await summarizeArticle(article.title, article.url, article.snippet);
      setInlineSummaries(prev => ({
        ...prev,
        [article.url]: { text: result, loading: false }
      }));
    } catch (error) {
      setInlineSummaries(prev => ({
        ...prev,
        [article.url]: { text: "요약을 생성하지 못했습니다.", loading: false }
      }));
    }
  };

  const handleSummarize = async (article: Article) => {
    setSelectedArticle(article);
    setSummary(null);
    setIsSummarizing(true);
    
    try {
      const result = await summarizeArticle(article.title, article.url, article.snippet);
      setSummary(result);
    } catch (error) {
      setSummary("요약을 생성하지 못했습니다.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const saveSummary = async (article?: Article, customSummary?: string) => {
    const art = article || selectedArticle;
    const sum = customSummary || summary;

    if (!user || !art || !sum) return;
    
    try {
      await addDoc(collection(db, 'summaries'), {
        userId: user.uid,
        articleUrl: art.url,
        title: art.title,
        summary: sum,
        timestamp: serverTimestamp()
      });
      fetchSavedSummaries();
      alert("요약이 저장되었습니다.");
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const cleanText = (text: string) => {
    // Remove common AI preambles like "2026년 5월 14일 현재..."
    let cleaned = text.replace(/^(20\d{2})년\s*\d+월\s*\d+일\s*현재.*?(합니다|있습니다|드립니다)\.?\s*/g, '');
    // Remove follow-up sentences like "본 리스트는... 포함하고 있습니다."
    cleaned = cleaned.replace(/^본 리스트는.*?포함하고 있습니다\.?\s*/g, '');
    // Remove headers like "### 오늘의 주요 뉴스"
    cleaned = cleaned.replace(/^###\s*오늘의\s*주요\s*뉴스.*?\n/g, '');
    return cleaned.trim();
  };

  const formatNewsDate = (dateStr?: string) => {
    try {
      if (!dateStr) return format(new Date(), 'yyyy-MM-dd(eee) HH시 mm분');
      const date = new Date(dateStr);
      const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
      return `${format(date, 'yyyy-MM-dd')}(${dayOfWeek}) ${format(date, 'HH시 mm분')}`;
    } catch {
      return dateStr || '';
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans overflow-hidden select-none">
      {/* Left Sidebar */}
      <aside className="w-[280px] border-r border-brand-border p-8 flex flex-col shrink-0">
        <div className="mb-10">
          <h1 className="font-serif text-3xl font-light tracking-tight text-brand-accent">Chronos</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-muted mt-1">Intelligence Digest</p>
        </div>

        <div className="space-y-8 overflow-y-auto flex-1 pr-2 custom-scrollbar">
          {/* Navigation */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-brand-muted mb-4 block font-bold">Navigation</label>
            {[
              { id: 'search', label: 'News Feed', icon: Search },
              { id: 'history', label: 'Search Archives', icon: History },
              { id: 'saved', label: 'Saved Insights', icon: Bookmark },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full text-left sidebar-item flex items-center gap-3 ${activeTab === tab.id ? 'sidebar-item-active' : ''}`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-brand-accent' : 'text-brand-muted'}`} />
                <span className={`text-xs font-bold uppercase tracking-widest ${activeTab === tab.id ? 'text-brand-text' : 'text-brand-muted'}`}>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Archive Short View */}
          <div className="pt-8 border-t border-brand-border space-y-4">
            <label className="text-[10px] uppercase tracking-wider text-brand-muted block font-bold">Recent Queries</label>
            <div className="space-y-2">
              {history.slice(0, 3).map((h) => (
                <button 
                  key={h.id}
                  onClick={() => {
                    setKeyword(h.keyword);
                    handleSearch(null, h.keyword);
                    setActiveTab('search');
                  }}
                  className="w-full text-left p-3 bg-slate-50 border border-slate-200 rounded hover:border-brand-accent/40 transition-colors text-xs truncate text-brand-text"
                >
                  <span className="text-brand-accent mr-2">#</span>
                  {h.keyword}
                </button>
              ))}
            </div>
          </div>

          {/* User Section */}
          <div className="pt-8 border-t border-brand-border">
            {user ? (
               <div className="flex items-center gap-3 mb-6 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <img 
                  src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border border-brand-border"
                />
                <div className="overflow-hidden">
                  <p className="text-xs font-bold truncate">{user.displayName || 'Researcher'}</p>
                  <button 
                    onClick={() => signOut()}
                    className="text-[10px] uppercase tracking-widest text-brand-accent hover:underline"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => signIn()}
                className="w-full btn-primary"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        <div className="mt-auto">
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] text-brand-muted italic opacity-80 font-serif">"Information is the resolution of uncertainty."</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f8fafc]">
        <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
          <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-12">
            <div>
              <h2 className="font-serif text-5xl md:text-6xl text-slate-900 tracking-tight">
                {activeTab === 'search' ? 'Current Intelligence' : 
                 activeTab === 'history' ? 'Archives' : 'Insights'}
              </h2>
              <p className="text-sm text-slate-500 italic mt-4 max-w-xl font-light">
                {activeTab === 'search' ? (keyword ? `Synthesizing data for query: ${keyword}` : 'Synchronizing with global major news events for today.') :
                 activeTab === 'history' ? 'A retrospective of data acquisition activities from the last 72 hours.' : 
                 'Decrypted findings and synthesized intelligence reports.'}
              </p>
            </div>
            <div className="text-left md:text-right hidden md:block">
              <div className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-bold mb-1">Status</div>
              <div className="flex items-center md:justify-end gap-2 text-green-600 font-serif">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Sync Active
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div 
                key="search-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-12"
              >
                {/* Search Form */}
                <form onSubmit={(e) => handleSearch(e)} className="max-w-2xl bg-white p-2 rounded-lg shadow-sm border border-slate-100 flex items-center">
                  <div className="p-3 text-slate-300">
                    <Search className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    placeholder="Keyword Query (e.g. AI Ethics, Green Energy...)"
                    className="flex-1 bg-transparent border-none py-4 px-2 text-lg focus:outline-none text-slate-900 placeholder:text-slate-300"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="bg-brand-accent text-brand-bg px-6 py-2 rounded font-bold uppercase tracking-widest text-[11px] disabled:opacity-30 transition-all hover:brightness-110 ml-2"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </form>

                {/* News Grid - Matched to Image */}
                <div className="grid grid-cols-1 gap-6 pb-32 max-w-4xl">
                  {searchResults.map((article, idx) => (
                    <motion.div
                      key={article.url + idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="news-card group"
                    >
                      <span className="news-card-date">{formatNewsDate(article.publishedAt)}</span>
                      <h3 
                        className="news-card-title font-sans cursor-pointer hover:text-brand-accent transition-colors"
                        onClick={() => window.open(article.url, '_blank')}
                      >
                        {article.title}
                      </h3>
                      <p className="news-card-snippet font-sans">
                        {cleanText(article.snippet)}
                      </p>

                      <div className="flex items-center justify-between mt-6">
                        <div className="flex items-center gap-4">
                           <button 
                            onClick={() => handleInlineSummarize(article)}
                            disabled={inlineSummaries[article.url]?.loading}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-500 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                          >
                            {inlineSummaries[article.url]?.loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Newspaper className="w-3 h-3" />}
                            AI 요약
                          </button>
                          <button 
                            onClick={() => handleSummarize(article)}
                            className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-brand-bg transition-all"
                          >
                            Deep Report
                          </button>
                        </div>
                        <div className="news-card-source">
                           <div className="w-5 h-5 bg-teal-50 rounded-full flex items-center justify-center text-teal-600">
                             <Share2 className="w-3 h-3" />
                           </div>
                           {article.source}
                        </div>
                      </div>

                      {/* Inline Summary Display */}
                      <AnimatePresence>
                        {inlineSummaries[article.url]?.text && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-6 p-6 bg-slate-50 rounded-lg border border-slate-100">
                              <div className="flex items-center gap-2 mb-3 text-slate-400">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                <span className="text-[10px] uppercase tracking-[0.3em] font-bold">Extraction Result</span>
                              </div>
                              <div className="prose prose-sm max-w-none text-slate-600 italic leading-relaxed">
                                <ReactMarkdown>{cleanText(inlineSummaries[article.url].text)}</ReactMarkdown>
                              </div>
                              <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
                                <button 
                                  onClick={() => saveSummary(article, inlineSummaries[article.url].text)}
                                  className="text-[10px] uppercase font-bold tracking-widest text-slate-500 hover:text-black transition-colors"
                                >
                                  Archive Insight
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}

                  {searchResults.length === 0 && !isSearching && (
                    <div className="py-32 flex flex-col items-center justify-center text-slate-300">
                      <Newspaper className="w-16 h-16 opacity-10 mb-6" />
                      <p className="text-sm uppercase tracking-widest font-light italic">Observation network standby...</p>
                    </div>
                  )}

                  {isSearching && (
                    <div className="py-32 flex flex-col items-center justify-center space-y-6">
                      <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
                      <p className="text-xs uppercase tracking-[0.5em] font-bold text-slate-300">Decrypting streams</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {history.length > 0 ? history.map((record) => (
                  <div key={record.id} className="bg-white p-8 border border-slate-100 flex flex-col justify-between hover:shadow-md transition-all rounded-xl">
                    <div>
                      <div className="flex items-center gap-3 mb-6">
                        <Calendar className="w-4 h-4 text-slate-300" />
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                          {record.timestamp instanceof Timestamp ? format(record.timestamp.toDate(), 'MMM dd, HH:mm') : 'Recent'}
                        </span>
                      </div>
                      <h4 className="font-serif text-2xl text-slate-900 mb-6 font-bold line-clamp-1">"{record.keyword}"</h4>
                      <div className="space-y-4">
                        {record.articles?.slice(0, 3).map((art, i) => (
                          <div key={i} className="text-[11px] text-slate-500 line-clamp-1 border-l border-slate-100 pl-3 italic">
                            {art.title}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setSearchResults(record.articles || []);
                        setActiveTab('search');
                      }}
                      className="mt-10 text-[10px] uppercase font-bold tracking-widest text-slate-400 hover:text-black transition-all text-center border border-slate-100 py-3 rounded-full"
                    >
                      Re-examine Data
                    </button>
                  </div>
                )) : (
                  <div className="col-span-full py-32 text-center text-slate-300">
                    <p className="text-xs uppercase tracking-widest italic opacity-40">No historical records in local cipher</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'saved' && (
              <motion.div 
                key="saved-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid gap-12"
              >
                {savedSummaries.length > 0 ? savedSummaries.map((saved) => (
                   <div key={saved.id} className="bg-white p-10 rounded-xl shadow-sm border border-slate-50 relative group">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      <h4 className="text-[11px] uppercase tracking-[0.4em] font-bold text-slate-400">Archived Perception Report</h4>
                      <div className="flex-1 border-t border-slate-100" />
                      <span className="text-[10px] text-slate-400 font-mono">
                        {saved.timestamp instanceof Timestamp ? format(saved.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : 'STABLE'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                      <div className="lg:col-span-3 space-y-6">
                        <h3 className="font-serif text-3xl mb-6 font-bold text-slate-900 group-hover:text-black transition-colors">{saved.title}</h3>
                        <div className="prose prose-sm max-w-none text-slate-600 leading-relaxed font-light italic border-l border-slate-100 pl-8">
                          <ReactMarkdown>{saved.summary}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="flex flex-col justify-end gap-4 p-6 bg-slate-50">
                        <div className="space-y-4 mb-4">
                          <div className="flex justify-between text-[10px] uppercase tracking-widest">
                            <span className="text-slate-400">Origin</span>
                            <span className="text-slate-900 font-bold truncate ml-2">Verified</span>
                          </div>
                          <div className="flex justify-between text-[10px] uppercase tracking-widest border-b border-slate-200 pb-2">
                            <span className="text-slate-400">Integrity</span>
                            <span>High</span>
                          </div>
                        </div>
                        <a 
                          href={saved.articleUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-center py-4 bg-white border border-slate-100 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
                        >
                          Access Original
                        </a>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="py-32 text-center text-slate-300">
                    <Bookmark className="w-12 h-12 opacity-10 mx-auto mb-6" />
                    <p className="text-sm uppercase tracking-widest italic opacity-40">Insight database currently empty</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Synthesis Modal (Deep Report Only) */}
      <AnimatePresence>
        {(selectedArticle || isSummarizing) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedArticle(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.98, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                   <span className="font-serif italic text-slate-400 text-lg">Detailed Intelligence Analysis</span>
                </div>
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="p-3 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-300" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 md:p-20 custom-scrollbar">
                {isSummarizing ? (
                  <div className="py-24 flex flex-col items-center justify-center space-y-10">
                    <Loader2 className="w-16 h-16 animate-spin text-slate-200" />
                    <div className="text-center space-y-4">
                      <p className="text-xs uppercase tracking-[0.5em] text-slate-400 font-bold">Parsing Narrative Components</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-16">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">
                        <span>Terminal Analysis</span>
                        <span className="text-slate-200">|</span>
                        <span>{selectedArticle?.source}</span>
                      </div>
                      <h2 className="font-serif text-5xl text-slate-900 leading-tight font-bold">{selectedArticle?.title}</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-20">
                      <div className="lg:col-span-2 space-y-12">
                        <div className="prose prose-xl max-w-none text-slate-700 leading-relaxed font-light italic border-l border-slate-100 pl-12">
                           <ReactMarkdown>{cleanText(summary || "")}</ReactMarkdown>
                        </div>
                      </div>
                      
                      <div className="space-y-10">
                        <div className="p-8 bg-slate-50 space-y-6">
                          <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400 block font-bold mb-4">Metadata Analysis</label>
                          <div className="space-y-4">
                            <div className="flex justify-between text-[11px] border-b border-slate-200 pb-2">
                              <span className="text-slate-400">Origin</span>
                              <span className="text-slate-900 truncate ml-4 font-bold">{selectedArticle?.source}</span>
                            </div>
                            <div className="flex justify-between text-[11px] border-b border-slate-200 pb-2">
                              <span className="text-slate-400">Analysis</span>
                              <span className="text-slate-900 font-bold italic">Synthesized</span>
                            </div>
                            <div className="flex justify-between text-[11px] border-b border-slate-200 pb-2">
                              <span className="text-slate-400">Timestamp</span>
                              <span className="text-slate-900">{formatNewsDate(selectedArticle?.publishedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <button 
                            onClick={() => saveSummary()}
                            disabled={!user}
                            className="bg-brand-accent text-brand-bg w-full py-5 text-sm font-bold uppercase tracking-widest hover:brightness-110 transition-all rounded"
                          >
                            Permanent Archive
                          </button>
                          <a 
                            href={selectedArticle?.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full text-center py-4 bg-white border border-slate-100 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors block"
                          >
                            Access Data Origin
                          </a>
                        </div>
                        {!user && <p className="text-[10px] text-center text-slate-400 italic uppercase tracking-wider">Sync required for archiving</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
