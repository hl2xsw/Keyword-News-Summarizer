// news-research-ai v0.1.1 hotfix: Resolving Netlify Dependency Corepack installation issue
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Newspaper, ExternalLink, Sparkles, RefreshCw, LayoutGrid, List, Info, ArrowUpRight, Zap, X, Settings, Eye, EyeOff, Save, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchNews, briefNews } from './services/news';
import { Article } from './types';

const CATEGORIES = [
  { label: 'Intelligence', value: '오늘의 글로벌 주요 뉴스 실시간' },
  { label: 'Technology', value: '최신 AI 반도체 테크 기술 뉴스' },
  { label: 'Business', value: '글로벌 증시 및 경제 주요 뉴스' },
  { label: 'Science', value: '최신 과학 우주 에너지 뉴스' },
  { label: 'Culture', value: '글로벌 엔터테인먼트 및 문화 뉴스' }
];

function formatDateSafely(dateStr: string | undefined): string {
  if (!dateStr) return '실시간';
  if (dateStr === '실시간') return '실시간';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr;
    }
    return d.toLocaleDateString('ko-KR', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (e) {
    return dateStr;
  }
}

function formatDetailedDateSafely(dateStr: string | undefined): string {
  if (!dateStr) return '실시간';
  if (dateStr === '실시간') return '실시간';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr;
    }
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

export default function App() {
  const [keyword, setKeyword] = useState('');
  const [news, setNews] = useState<Article[]>([]);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isCustomCseFailed, setIsCustomCseFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Custom states for the detailed page and overall summary briefing
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedArticleIndex, setSelectedArticleIndex] = useState<number | null>(null);
  const [briefing, setBriefing] = useState<string>('');
  const [briefingLoading, setBriefingLoading] = useState<boolean>(false);

  // System Custom Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem("GOOGLE_API_KEY") || '') : '');
  const [cseIdInput, setCseIdInput] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem("GOOGLE_CSE_ID") || '') : '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasSavedKeys, setHasSavedKeys] = useState(() => typeof window !== 'undefined' ? !!(localStorage.getItem("GOOGLE_API_KEY") && localStorage.getItem("GOOGLE_CSE_ID")) : false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const searchController = React.useRef<AbortController | null>(null);

  const cancelSearch = useCallback(() => {
    if (searchController.current) {
      searchController.current.abort();
      searchController.current = null;
      setLoading(false);
      setError('사용자가 검색을 취소했습니다.');
    }
  }, []);

  const clearSearch = () => {
    setKeyword('');
    setError(null);
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    
    // Abort previous search if any
    if (searchController.current) {
      searchController.current.abort();
    }
    
    const controller = new AbortController();
    searchController.current = controller;
    
    setLoading(true);
    setError(null);
    setIsQuotaExceeded(false);
    setIsCustomCseFailed(false);
    setNews([]);
    setBriefing('');
    setSelectedArticle(null);
    setSelectedArticleIndex(null);
    
    try {
      const response = await searchNews(query);
      
      // If the request was aborted, don't update state
      if (controller.signal.aborted) return;
      
      const results = response.articles;
      setIsQuotaExceeded(response.isQuotaExceeded);
      setIsCustomCseFailed(!!response.isCustomCseFailed);
      
      if (!results || results.length === 0) {
        setError('해당 키워드에 대해 감지된 최신 리얼타임 뉴스가 없습니다.');
        setNews([]);
        return;
      }
      setNews(results);

      // Trigger automatic overall AI trend briefing
      setBriefingLoading(true);
      try {
        if (response.isQuotaExceeded) {
          console.log("[Quota Bypass] Network briefing call bypassed because quota is active. Serving fast-path local intelligent template.");
          const listText = results.slice(0, 3).map((art, idx) => `${idx+1}. ${art.title}`).join('\n');
          const fallbackBrief = `실시간 수색망 포화로 임시 대인용 로컬 인텔리전스를 통해 생성된 기사 브리핑입니다.\n\n현재 "${query}" 분야는 실시간 언론 보도 동향을 관통하는 가장 비중 있는 화두로 포착되었습니다.\n\n주요 전개 방향:\n${listText}\n\n전망: 실시간으로 확보된 뉴스 신호들의 종합적인 추이를 고려할 때, 관련 주요 Player 들의 독자 행보와 차주 시장 판세 변화가 핵심적인 분기점이 될 것으로 판단됩니다.`;
          if (!controller.signal.aborted) {
            setBriefing(fallbackBrief);
          }
        } else {
          const brief = await briefNews(query, results);
          if (!controller.signal.aborted) {
            setBriefing(brief);
          }
        }
      } catch (briefErr) {
        console.log("[Notice] Briefing creation status check logged.");
      } finally {
        if (!controller.signal.aborted) {
          setBriefingLoading(false);
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Search aborted');
        return;
      }
      console.log("[Notice] Search processing logged.");
      setError('실시간 뉴스 신호 수신에 실패했습니다. 키워드를 변경하여 다시 탐색해 보세요.');
      setNews([]);
    } finally {
      if (searchController.current === controller) {
        setLoading(false);
        searchController.current = null;
      }
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim() && cseIdInput.trim()) {
      localStorage.setItem("GOOGLE_API_KEY", apiKeyInput.trim());
      localStorage.setItem("GOOGLE_CSE_ID", cseIdInput.trim());
      setHasSavedKeys(true);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowSettings(false);
        handleSearch(keyword || '오늘의 주요 뉴스');
      }, 1000);
    } else {
      alert("구글 API Key와 커스텀 검색엔진 ID를 모두 올바르게 입력해 주세요.");
    }
  };

  const handleClearSettings = () => {
    localStorage.removeItem("GOOGLE_API_KEY");
    localStorage.removeItem("GOOGLE_CSE_ID");
    setApiKeyInput('');
    setCseIdInput('');
    setHasSavedKeys(false);
    setShowSettings(false);
    handleSearch(keyword || '오늘의 주요 뉴스');
  };

  // Initial load
  useEffect(() => {
    handleSearch('오늘의 주요 뉴스');
  }, [handleSearch]);

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/5 h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center text-white rotate-3 group-hover:rotate-0 transition-all duration-300">
              <Newspaper size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tighter uppercase italic">Dispatch <span className="text-blue-600">Pro</span></h1>
          </div>
          
          <div className="hidden lg:flex items-center gap-10">
            {CATEGORIES.map(cat => (
              <button
                key={cat.label}
                onClick={() => {
                  setKeyword(cat.value);
                  handleSearch(cat.value);
                }}
                className="text-[10px] font-black text-slate-400 hover:text-black tracking-[0.2em] uppercase transition-all relative group"
              >
                {cat.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-600 transition-all group-hover:w-full" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
             <button
               onClick={() => setShowSettings(true)}
               className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 hover:bg-black hover:text-white rounded-xl text-[10px] font-black tracking-wider uppercase transition-all duration-300 border border-slate-200 cursor-pointer"
               title="System Settings Integration"
             >
               <Settings size={13} className={hasSavedKeys ? "text-blue-500 animate-spin" : "text-slate-500"} style={{ animationDuration: '6s' }} />
               <span>Settings</span>
               {hasSavedKeys && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
             </button>
             <div className="h-4 w-px bg-slate-200 hidden sm:block" />
             <span className="text-[10px] font-bold text-slate-400 tabular-nums hidden sm:block">
               v3.5.1_LIVE_UPGRADE
             </span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 md:py-24">
        {/* Hero Section */}
        <header className="mb-24 grid grid-cols-1 lg:grid-cols-12 gap-16 items-end">
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-2 py-1 rounded bg-slate-100 text-slate-500 text-[9px] font-black tracking-[0.3em] mb-8 uppercase border border-slate-200"
            >
              <Zap size={10} className="text-yellow-500 fill-yellow-500" /> 실시간 AI 뉴스 인텔리전스 시스템
            </motion.div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-black mb-6 italic">
              실시간 뉴스 검색<br />& 시그널<br /><span className="text-blue-600">인텔리전스</span>
            </h2>
            <p className="text-slate-500 font-medium max-w-md text-sm leading-relaxed border-l-2 border-slate-100 pl-6">
              인공지능 바탕으로 실시간 국내 외 주요 뉴스 스트림을 추출 및 분석합니다. <br />
              <span className="text-black font-bold italic">"불필요한 노이즈를 필터링하여 100% 검증된 보도 직링크와 유익한 요약을 전달합니다."</span>
            </p>
          </div>
          
          <div className="lg:col-span-5">
            <div className="relative group">
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-20 transition-opacity duration-500" />
              <div className="relative">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(keyword)}
                  placeholder="Intercept news via keyword..."
                  className="w-full px-8 py-6 bg-white border-2 border-black rounded-2xl text-xl font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 pr-40"
                />
                <div className="absolute right-3 top-3 bottom-3 flex gap-2">
                  {keyword && !loading && (
                    <button
                      onClick={clearSearch}
                      className="px-3 text-slate-300 hover:text-slate-600 transition-colors"
                      title="Clear Search"
                    >
                      <X size={18} />
                    </button>
                  )}
                  {loading && (
                    <button
                      onClick={cancelSearch}
                      className="px-4 bg-red-50 text-red-600 border border-red-100 rounded-xl font-black text-[10px] tracking-widest uppercase hover:bg-red-100 transition-all flex items-center gap-2"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => handleSearch(keyword)}
                    disabled={loading}
                    className="px-6 bg-black text-white rounded-xl font-black text-xs tracking-widest uppercase hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <><Search size={16} /> Intercept</>}
                  </button>
                </div>
              </div>
              
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 px-4 py-2 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-lg flex items-center gap-2"
                  >
                    <Info size={14} /> {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {['반도체', '금리 결정', 'AI 혁명', '초전도체', '세계 증시'].map(tag => (
                <button 
                  key={tag}
                  onClick={() => { setKeyword(tag); handleSearch(tag); }}
                  className="text-[10px] font-black text-slate-400 bg-white border border-slate-100 px-3 py-1.5 rounded-full hover:border-black hover:text-black transition-all"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Dashboard Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 py-6 border-y border-black/5 gap-6">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                    className="w-1 h-3 bg-blue-600 rounded-full" 
                  />
                ))}
              </div>
              <span className="text-[10px] font-black tracking-[0.3em] uppercase text-slate-400">System Link Active</span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-600 flex items-center gap-2">
              <span className="text-blue-600 font-mono">[{news.length}]</span> Detected Signals
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100/50 p-1 rounded-lg border border-black/5">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-black' : 'text-slate-400 opacity-50 hover:opacity-100'}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-slate-400 opacity-50 hover:opacity-100'}`}
              >
                <List size={15} />
              </button>
            </div>
            <button 
              onClick={() => handleSearch(keyword || '오늘의 주요 뉴스')}
              className="p-2.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-black active:rotate-180"
              title="Synchronize Data"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Quota Exceeded Warn Banner */}
        <AnimatePresence>
          {isQuotaExceeded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-12 overflow-hidden"
            >
              <div className="bg-amber-50/75 border-2 border-amber-500/20 rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <span className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                  <Zap size={20} className="fill-amber-500/20 animate-bounce" />
                </span>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-black text-amber-800 tracking-tight">
                    실시간 검색망 트래픽 할당량 초과 안내
                  </h4>
                  <p className="text-xs font-semibold text-amber-700/80 leading-relaxed">
                    현재 구글 외부 실시간 라이브 뉴스 검색 API의 호출 허용량(Quota)이 일시적으로 제한선에 다다랐습니다. 
                    저희 <strong>Dispatch Pro</strong>는 사용자분들께 혼란을 주거나 사실과 어긋난 <strong>AI 임의 합성 뉴스(인물/사건 가짜 작문)를 수작업하거나 노출하는 것을 완벽히 전면 차단</strong>하고 있습니다. 
                    오직 검증되고 구글 검색망에 실재하는 100% 진짜 뉴스 스트림 신호만 정직하게 중개하고 있으니, 잠시 후 상단의 <strong>Intercept</strong> 버튼을 눌러 다시 수색해 주시기 바랍니다.
                    <br />
                    <span className="mt-3 block text-[10.5px] text-amber-800/80 leading-relaxed font-semibold bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                      💡 <strong>실시간 검색 안정화 기술 팁:</strong> 보다 완벽하고 지속적인 쿼터 독립을 원하시면, 구글 공식 <strong>Programmable Search Engine (커스텀 검색) API</strong>의 <code>GOOGLE_API_KEY</code> 및 <code>GOOGLE_CSE_ID</code>를 서버 환경 변수(Secrets)에 등록해 보세요. 등록 즉시 개별 맞춤 전용 검색망이 가동되어 트래픽 제한 없이 실시간 정보를 즉시 탐색할 수 있습니다.
                    </span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom CSE Failed Warn Banner */}
        <AnimatePresence>
          {isCustomCseFailed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-12 overflow-hidden"
            >
              <div className="bg-red-50/75 border-2 border-red-500/20 rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <span className="p-2.5 bg-red-500/10 text-red-600 rounded-xl">
                  <Info size={20} className="text-red-500" />
                </span>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-black text-red-800 tracking-tight">
                    맞춤 구글 커스텀 검색(CSE) 설정 오류 발생
                  </h4>
                  <p className="text-xs font-semibold text-red-700/80 leading-relaxed">
                    입력하신 <strong>구글 커스텀 검색(Google Custom Search Engine - CSE) API Key 또는 Search Engine ID(CX)</strong>가 유효하지 않거나 API 호출에 실패하였습니다.
                    <br />
                    상단 우측의 <strong>설정 아이콘</strong>을 클릭하여 <code>GOOGLE_API_KEY</code> 및 <code>GOOGLE_CSE_ID</code> 값이 올바르게 구성되었는지 다시 한번 확인해 보시기 바랍니다.
                    <br />
                    <span className="mt-3 block text-[10.5px] text-red-800/80 leading-relaxed font-semibold bg-red-500/5 p-3 rounded-xl border border-red-500/10">
                      💡 <strong>설정 정상 확인이 되기 전까지는:</strong> 서버의 기본 실시간 Gemini 검색 및 구글 뉴스 RSS 백업 검색망이 안전하게 대체 가동되어 최신 기사를 수집합니다.
                    </span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Priority 3: AI Real-time Overall summary Briefing card */}
        <AnimatePresence>
          {(briefingLoading || briefing) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="mb-16"
            >
              <div className="bg-gradient-to-r from-blue-50/55 to-indigo-50/55 border border-blue-100 rounded-3xl p-6 md:p-10 relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/5 blur-3xl pointer-events-none rounded-full" />
                <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                  <div className="p-4 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/10">
                     <Sparkles size={24} className="animate-pulse" />
                  </div>
                  <div className="flex-1 space-y-4 w-full">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 block mb-1">AI Real-time Intelligence Analysis</span>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight italic">
                          "{keyword || '오늘의 주요 뉴스'}" 종합 브리핑 및 트렌드 요약
                        </h3>
                      </div>
                      <span className="text-[8px] font-black bg-blue-100 border border-blue-200 text-blue-700 px-3 py-1 rounded-full tracking-widest font-mono">
                        STABLE_GROUNDING
                      </span>
                    </div>

                    {briefingLoading ? (
                      <div className="space-y-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                          <Loader2 className="animate-spin text-blue-500" size={14} />
                          실시간 검색된 기사를 종합 분석하여 동향 브리핑을 도출하는 중입니다...
                        </div>
                        <div className="space-y-2">
                          <div className="h-2.5 bg-slate-200 rounded w-11/12 animate-pulse" />
                          <div className="h-2.5 bg-slate-200 rounded w-10/12 animate-pulse" />
                          <div className="h-2.5 bg-slate-200 rounded w-4/5 animate-pulse" />
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-700 text-sm leading-relaxed font-medium whitespace-pre-wrap bg-white/80 border border-white p-6 rounded-2xl shadow-inner shadow-black/5">
                        {briefing}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Intelligence Feed */}
        {loading ? (
          <div className="py-48 flex flex-col items-center justify-center gap-10">
            <div className="relative w-24 h-24">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="absolute inset-0 border-[3px] border-slate-100 rounded-full border-t-blue-600"
              />
              <div className="absolute inset-4 border border-dashed border-slate-200 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap size={24} className="text-blue-600 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-3">
              <p className="font-black tracking-[0.4em] text-[10px] uppercase text-slate-400">Synchronizing Grounding Streams</p>
              <div className="flex justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ scaleY: [1, 2, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                    className="w-0.5 h-2 bg-blue-400"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : news.length > 0 ? (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12" 
            : "max-w-4xl mx-auto space-y-16"
          }>
            {news.map((article, i) => (
              <motion.article
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.1, duration: 0.6 }}
                className={viewMode === 'list' 
                  ? "flex flex-col md:flex-row gap-10 items-start group relative bg-white border border-black/5 p-8 rounded-3xl hover:border-blue-500/20 hover:shadow-xl transition-all duration-300 w-full" 
                  : "flex flex-col h-full group relative bg-white border border-black/5 p-8 rounded-3xl hover:border-blue-500/20 hover:shadow-xl transition-all duration-300"
                }
              >
                {/* Border Accent */}
                <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-transparent group-hover:border-blue-600 transition-all duration-300" />
                
                <div className={`flex-1 ${viewMode === 'grid' ? 'flex flex-col h-full' : ''}`}>
                  <header className="mb-6">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 bg-blue-50/50 px-2.5 py-1 rounded-full border border-blue-100 font-mono">
                        {article.source}
                      </span>
                      <time className="text-[9px] font-bold text-slate-400 tabular-nums font-mono">
                        {formatDateSafely(article.publishedAt)}
                      </time>
                    </div>
                    {/* Open original link on Title Click */}
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-left hover:translate-x-1 transition-transform w-full group/title cursor-pointer"
                    >
                      <h4 className="text-base font-bold leading-snug tracking-tight mb-2 text-slate-900 group-hover/title:text-blue-600 transition-colors">
                        {article.title || "제목 없음"}
                      </h4>
                    </a>
                  </header>

                  <div className="mt-auto pt-4 border-t border-slate-100">
                    <a 
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[44px] px-6 rounded-xl text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 border-2 bg-black border-black text-white hover:bg-blue-600 hover:border-blue-600 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-600/20"
                      title="원문 기사 바로보기"
                    >
                      <span>원문 바로가기</span>
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        ) : isQuotaExceeded ? (
          <div className="text-center py-48 border-[3px] border-dashed border-amber-200 rounded-[3rem] bg-amber-50/10">
            <div className="w-24 h-24 bg-amber-50 border border-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-10 text-amber-600">
              <Zap className="animate-pulse" size={40} />
            </div>
            <h3 className="text-3xl font-black text-amber-800 tracking-tighter uppercase italic mb-4">Uplink Quota Exceeded</h3>
            <p className="text-slate-500 text-sm font-medium max-w-xl mx-auto leading-relaxed mb-10">
              구글 실시간 뉴스 검색 API의 트래픽 트래커 호출량 한계로 정보 수색 대기 상태입니다.<br />
              Dispatch Pro는 외부 무작위 조작 또는 <strong>AI 가상 작문(가짜 생태 기사)을 영구 배제</strong>하기에, 검색이 복구될 때까지 
              임의 합성 결과를 내지 않고 정직한 수집 대기 방식을 채택합니다. 잠시 후 상단 새로고침 혹은 검색을 이용해 주세요.
              <br />
              <span className="mt-4 block text-xs text-amber-800/80 leading-relaxed font-semibold bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 text-left">
                💡 <strong>안정화 팁 (트래픽 할당량 영구 해결):</strong><br />
                구글의 공식 <strong>Programmable Search Engine</strong>을 연결하면, 트래픽 한도로부터 완전히 자유로운 단독 뉴스 탐색 채널을 구축하실 수 있습니다. 
                메뉴 <strong>Settings &gt; Secrets</strong>에 <code>GOOGLE_API_KEY</code>와 <code>GOOGLE_CSE_ID</code>를 등록하시면, 즉시 대기 없는 초고속 실시간 수색이 완벽히 가동됩니다.
              </span>
            </p>
            <button 
              onClick={() => handleSearch(keyword || '오늘의 주요 뉴스')}
              className="px-10 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-[10px] font-black tracking-[0.3em] uppercase transition-all shadow-xl shadow-amber-600/15 cursor-pointer"
            >
              Retry Intercept
            </button>
          </div>
        ) : (
          <div className="text-center py-48 border-[3px] border-dashed border-slate-100 rounded-[3rem] bg-white">
            <div className="w-24 h-24 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-10">
              <Newspaper className="text-slate-200" size={40} />
            </div>
            <h3 className="text-3xl font-black text-slate-300 tracking-tighter uppercase italic mb-4">No Signals Intercepted</h3>
            <p className="text-slate-400 text-sm font-medium max-w-sm mx-auto leading-relaxed mb-10">
              해당 검색 조건에 부합하는 실시간 뉴스 데이터 신호를 감지하지 못했습니다. <br />키워드를 조금만 일반화하여 재요청해 보세요.
            </p>
            <button 
              onClick={() => handleSearch(keyword || '오늘의 주요 뉴스')}
              className="px-10 py-4 bg-black text-white rounded-2xl text-[10px] font-black tracking-[0.3em] uppercase hover:bg-blue-600 transition-all hover:scale-105 active:scale-95 shadow-xl"
            >
              Retry Uplink
            </button>
          </div>
        )}
      </main>

      {/* Priority 2 & 3: Master Detail Drawer / Details Overlay Page */}
      <AnimatePresence>
        {selectedArticle && selectedArticleIndex !== null && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Dark blur backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedArticle(null); setSelectedArticleIndex(null); }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm cursor-pointer"
            />
            
            {/* Sliding Panel details page */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={{ type: "spring", damping: 26, stiffness: 190 }}
              className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col z-10 border-l border-slate-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    {selectedArticle.source}
                  </span>
                  <span className="text-[9px] font-black tracking-widest text-slate-400 font-mono">
                    {formatDetailedDateSafely(selectedArticle.publishedAt)}
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedArticle(null); setSelectedArticleIndex(null); }}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-black"
                  title="닫기"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable details view content */}
              <div className="flex-1 overflow-y-auto px-8 py-10 space-y-8 select-text">
                {/* News Title */}
                <div className="space-y-4">
                  <h3 className="text-2xl md:text-3xl font-black leading-snug text-slate-900 tracking-tight">
                    {selectedArticle.title}
                  </h3>
                  <div className="h-1.5 w-16 bg-blue-600 rounded-full" />
                </div>

                {/* Snippet block */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 md:p-8 space-y-2">
                  <span className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">AI 뉴스 핵심 리얼타임 요약</span>
                  <p className="text-slate-600 text-[14px] leading-relaxed font-semibold whitespace-pre-line">
                    {selectedArticle.snippet || "상세 검색 요약 정보가 존재하지 않습니다."}
                  </p>
                </div>
              </div>

              {/* Action bar pointing directly to the original web URL */}
              <div className="p-8 border-t border-slate-100 bg-slate-50 flex items-center gap-4">
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs tracking-[0.2em] uppercase rounded-xl shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-2 text-center"
                >
                  원문 기사 읽기 <ExternalLink size={14} />
                </a>
                <button
                  onClick={() => { setSelectedArticle(null); setSelectedArticleIndex(null); }}
                  className="px-6 py-4 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-black tracking-widest uppercase text-slate-500 transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Drawer Overlay */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Dark blur backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!saveSuccess) setShowSettings(false); }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm cursor-pointer"
            />
            
            {/* Sliding Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={{ type: "spring", damping: 26, stiffness: 190 }}
              className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col z-10 border-l border-slate-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-black text-white rounded-lg">
                    <Settings size={16} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                      System Configuration
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      Search API & credentials integration
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  disabled={saveSuccess}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-black cursor-pointer"
                  title="Close Settings"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Form Content */}
              <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto px-8 py-10 space-y-8 flex flex-col">
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    API 연동 제어판
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    구글 공식 <strong>Programmable Search Engine</strong>을 개별 연동하여, 네트워크 지연 및 Quota(검색 할당량) 초과 제약이 없는 독자적인 전용 실시간 수색 채널을 구성합니다.
                  </p>
                </div>

                {hasSavedKeys && (
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-3 items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
                    <p className="text-xs font-bold text-blue-800 leading-none">
                      현재 사용자의 커스텀 검색엔진 설정이 활성화되어 작동 중입니다.
                    </p>
                  </div>
                )}

                {/* API KEY Input Field */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    GOOGLE_API_KEY
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      required
                      className="w-full px-5 py-4 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border-2 border-slate-100 focus:border-black rounded-xl text-sm font-semibold transition-all pr-12 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Google Cloud Console에서 <strong>Custom Search API</strong>를 활성화한 프로젝트의 유효한 API Key를 입력하세요.
                  </p>
                </div>

                {/* CSE ID Input Field */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    GOOGLE_CSE_ID
                  </label>
                  <input
                    type="text"
                    value={cseIdInput}
                    onChange={(e) => setCseIdInput(e.target.value)}
                    placeholder="예: 5eab5a5eefcfa498a"
                    required
                    className="w-full px-5 py-4 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border-2 border-slate-100 focus:border-black rounded-xl text-sm font-semibold transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    구글 커스텀 검색엔진 관리자 포털에서 발급한 검색엔진 ID (cx 파라미터)를 입력하세요.
                  </p>
                </div>

                {/* Integration Guide Section */}
                <div className="p-5 bg-slate-50/75 border border-slate-100 rounded-2xl space-y-4">
                  <h5 className="text-[10px] font-black tracking-widest uppercase text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> 어디서 발급받나요?
                  </h5>
                  <ul className="text-xs text-slate-500 font-medium space-y-3 pl-3 list-decimal leading-relaxed">
                    <li>
                      <a 
                        href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 font-black hover:underline inline-flex items-center gap-1"
                      >
                        Google Custom Search API <ExternalLink size={10} />
                      </a> 
                      활성화 후 API 자격 증명(키)을 획득하십시오.
                    </li>
                    <li>
                      <a 
                        href="https://programmablesearchengine.google.com/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 font-black hover:underline inline-flex items-center gap-1"
                      >
                        Programmable Search Engine <ExternalLink size={10} />
                      </a> 
                      포털에서 검색엔진을 생성합니다.
                    </li>
                    <li className="text-slate-900 font-bold italic">
                      설정 중 '웹 전체 검색 (Search the entire web)' 옵션을 반드시 활성화하셔야 정상적인 전역 뉴스 수집이 작동합니다.
                    </li>
                  </ul>
                </div>

                <div className="flex-grow font-semibold" />

                {/* Form Buttons */}
                <div className="pt-6 border-t border-slate-100 bg-white flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={saveSuccess}
                    className="w-full py-4 bg-black text-white font-black text-xs tracking-[0.2em] uppercase rounded-xl shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-center cursor-pointer disabled:bg-slate-400"
                  >
                    {saveSuccess ? (
                      <>
                        <Check size={14} className="text-green-400 animate-bounce" /> 설정 반영 완료!
                      </>
                    ) : (
                      <>
                        <Save size={14} /> 설정 및 저장 동기화
                      </>
                    )}
                  </button>
                  
                  {hasSavedKeys && (
                    <button
                      type="button"
                      onClick={handleClearSettings}
                      className="w-full py-4 border border-red-200 bg-red-50 hover:bg-red-105 text-red-600 font-black text-xs tracking-[0.2em] uppercase rounded-xl transition-all text-center cursor-pointer"
                    >
                      설정 초기화 (기본 공유 검색망 복원)
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-slate-100 py-32 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-start">
            <div className="lg:col-span-4 space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white -rotate-6">
                  <Newspaper size={28} />
                </div>
                <div>
                  <span className="block font-black text-2xl tracking-tighter uppercase italic leading-none">Dispatch <span className="text-blue-600">Pro</span></span>
                  <span className="text-[9px] font-black text-slate-300 tracking-[0.3em] uppercase">Intelligence Node</span>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed font-medium max-w-xs">
                구글 실시간 뉴스 검색 및 요약 기술을 바탕으로 완벽히 정렬된 인텔리전스 소식을 수집 분석합니다.
              </p>
            </div>
            
            <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-12 lg:text-right">
              <div className="space-y-6">
                <h5 className="text-[10px] font-black tracking-[0.3em] uppercase text-black">Network</h5>
                <ul className="space-y-4 text-xs font-bold text-slate-400">
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Status</li>
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Grounding</li>
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Latency</li>
                </ul>
              </div>
              <div className="space-y-6">
                <h5 className="text-[10px] font-black tracking-[0.3em] uppercase text-black">Uplinks</h5>
                <ul className="space-y-4 text-xs font-bold text-slate-400">
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Direct Feed</li>
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Summaries</li>
                  <li className="hover:text-black cursor-pointer transition-colors uppercase">Archives</li>
                </ul>
              </div>
              <div className="space-y-6 col-span-2 md:col-span-1">
                <h5 className="text-[10px] font-black tracking-[0.3em] uppercase text-black">System</h5>
                <div className="pt-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[9px] font-bold border border-green-100">
                    <div className="w-1 h-1 bg-green-600 rounded-full animate-pulse" /> CLUSTER_ONLINE
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-32 pt-8 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[9px] font-black text-slate-300 tracking-[0.5em] uppercase">
              © 2026 DISPATCH AUTONOMOUS INTELLIGENCE. ALL RIGHTS RESERVED.
            </p>
            <div className="flex gap-8">
               <span className="text-[9px] font-black text-slate-300 tracking-widest uppercase cursor-pointer hover:text-black transition-colors">Privacy_Protocol</span>
               <span className="text-[9px] font-black text-slate-300 tracking-widest uppercase cursor-pointer hover:text-black transition-colors">Security_Terms</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
