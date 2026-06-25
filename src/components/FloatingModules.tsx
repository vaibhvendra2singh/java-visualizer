import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Search, X, Loader2 } from 'lucide-react';
import { explainConcept } from '../services/groq';

export const FloatingModules: React.FC = () => {
  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // AI Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [typedResult, setTypedResult] = useState('');

  // Search Typewriter Effect
  useEffect(() => {
    if (!searchResult) {
      setTypedResult('');
      return;
    }
    setTypedResult('');
    let idx = 0;
    const interval = setInterval(() => {
      setTypedResult((prev) => prev + searchResult.charAt(idx));
      idx++;
      if (idx >= searchResult.length) {
        clearInterval(interval);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [searchResult]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResult('');
    try {
      const res = await explainConcept(searchQuery);
      setSearchResult(res);
    } catch (err) {
      setSearchResult('Sorry, I had trouble fetching an explanation. Please try again!');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      {/* 2. FLOATING CONTROL CHIPS (Right Edge - AI Search Only) */}
      <div className="fixed right-6 bottom-24 flex flex-col gap-2.5 z-40">
        {/* AI Concept Search trigger */}
        <motion.button
          onClick={() => {
            setIsSearchOpen(true);
            setSearchQuery('');
            setSearchResult('');
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black border border-white font-mono text-[10px] font-extrabold tracking-wide uppercase shadow-lg cursor-pointer transition-all duration-200"
        >
          <Sparkles className="w-3.5 h-3.5 fill-current" />
          AI Concept Search
        </motion.button>
      </div>

      {/* 3. AI CONCEPT SEARCH DIALOG (MODAL) */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl frosted-glass-card rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              {/* Corner Close Button */}
              <button 
                onClick={() => setIsSearchOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition duration-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-zinc-300" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Concept Search Console
                </h4>
              </div>

              {/* Form */}
              <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="e.g. Recursion, Binary Trees, Arrays..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-zinc-800 rounded-xl text-white outline-none focus:border-zinc-500 transition duration-200"
                  disabled={isSearching}
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-xl transition duration-200 cursor-pointer flex items-center justify-center min-w-[70px] disabled:opacity-40"
                >
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </button>
              </form>

              {/* Output block */}
              <div className="min-h-[100px] max-h-[350px] overflow-y-auto p-4 bg-zinc-950/60 border border-zinc-900 rounded-xl font-mono text-[11px] leading-relaxed text-zinc-300">
                {isSearching ? (
                  <div className="flex items-center gap-2 text-zinc-500 italic">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching database...</span>
                  </div>
                ) : typedResult ? (
                  <p className="whitespace-pre-wrap">{typedResult}<span className="inline-block w-1.5 h-3 bg-white ml-0.5 animate-pulse" /></p>
                ) : (
                  <span className="text-zinc-650 italic">
                    Enter any programming or Data Structures concept above to get a simplified explanation.
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
