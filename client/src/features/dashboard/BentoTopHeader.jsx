import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  X,
  ChevronDown,
  User,
  Sparkles
} from 'lucide-react';

export const BentoTopHeader = ({
  activeTab,
  onNavigate,
  currentUser,
  questions = [],
  onSelectQuestion,
  onOpenProfile
}) => {
  const [headerSearch, setHeaderSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = headerSearch.trim()
    ? questions
        .filter((q) => {
          const query = headerSearch.toLowerCase();
          const title = (q.title || '').toLowerCase();
          const statement = (q.statement || '').toLowerCase();
          const lang = (q.language || '').toLowerCase();
          const tags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';
          return (
            title.includes(query) ||
            statement.includes(query) ||
            lang.includes(query) ||
            tags.includes(query)
          );
        })
        .slice(0, 5)
    : [];

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setIsSearchOpen(false);
    if (onNavigate) onNavigate('bank');
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'bank':
        return 'Question Bank';
      case 'create':
        return 'Create Question';
      case 'tests':
        return 'Test Studio';
      case 'mutation':
        return 'Mutation Lab';
      case 'mcq':
        return 'Bulk MCQ Import';
      case 'paper':
        return 'Paper Designer';
      case 'exams':
        return 'Examinations';
      default:
        return 'Workspace';
    }
  };

  return (
    <header className="w-full flex items-center justify-between gap-4 py-2 px-1 select-none">
      {/* Left: Brand & Breadcrumb matching screenshot (TestForge / Question Bank) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate && onNavigate('dashboard')}
          className="flex items-center gap-1.5 text-sm font-extrabold text-[#171819] hover:opacity-80 transition-opacity cursor-pointer"
        >
          <span>TestForge</span>
          <span className="w-2 h-2 rounded-xs bg-[#EDFF72] -skew-x-12 inline-block" />
        </button>

        <span className="text-[#CBD0C8] font-bold">/</span>

        <span className="text-xs font-semibold text-[#777D78] px-2.5 py-1 rounded-full bg-white border border-[#DDE1DA]">
          {getPageTitle()}
        </span>
      </div>

      {/* Right Controls: Quick Search, Notification & Faculty Profile Dropdown */}
      <div className="flex items-center gap-3">
        {/* Quick Search Input */}
        <div ref={searchRef} className="relative w-48 sm:w-64">
          <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#777D78] pointer-events-none" />
            <input
              type="text"
              placeholder="Quick search..."
              value={headerSearch}
              onFocus={() => {
                if (headerSearch.trim()) setIsSearchOpen(true);
              }}
              onChange={(e) => {
                setHeaderSearch(e.target.value);
                setIsSearchOpen(true);
              }}
              className="w-full bg-white hover:bg-[#F8F9F7] focus:bg-white text-[#171819] placeholder-[#777D78] text-xs font-medium rounded-full pl-9 pr-10 py-1.5 border border-[#DDE1DA] focus:border-[#171819] focus:outline-none transition-all shadow-2xs"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#F2F3F0] text-[9px] font-mono text-[#777D78]">
              ⌘K
            </kbd>
          </form>

          {/* Search Dropdown */}
          {isSearchOpen && headerSearch.trim().length > 0 && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl overflow-hidden z-50 animate-fadeIn">
              <div className="px-3.5 py-2 bg-[#F8F9F7] border-b border-[#DDE1DA] flex items-center justify-between text-xs">
                <span className="font-bold text-[#777D78] text-[11px] uppercase">
                  Questions ({searchResults.length})
                </span>
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="font-bold text-[#171819] hover:underline cursor-pointer text-xs"
                >
                  View all →
                </button>
              </div>

              {searchResults.length > 0 ? (
                <div className="divide-y divide-[#DDE1DA]/60 max-h-72 overflow-y-auto">
                  {searchResults.map((q) => (
                    <div
                      key={q._id}
                      onClick={() => {
                        if (onSelectQuestion) onSelectQuestion(q);
                        setIsSearchOpen(false);
                        if (onNavigate) onNavigate('bank');
                      }}
                      className="p-2.5 hover:bg-[#F2F3F0] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#EDFF72] text-[#191A1D]">
                          {q.language}
                        </span>
                        <span className="text-[9px] text-[#777D78]">{q.difficulty}</span>
                      </div>
                      <h5 className="text-xs font-bold text-[#171819] line-clamp-1">{q.title}</h5>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-[#777D78] text-xs">No matching questions</div>
              )}
            </div>
          )}
        </div>

        {/* Notification Bell with unread dot */}
        <button
          type="button"
          title="Notifications"
          className="relative w-8 h-8 rounded-full bg-white border border-[#DDE1DA] flex items-center justify-center text-[#171819] hover:bg-[#F8F9F7] shadow-2xs cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <Bell className="w-3.5 h-3.5 text-[#777D78]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#EDFF72] border border-[#191A1D]" />
        </button>

        {/* Faculty Profile Dropdown Button matching screenshot */}
        <button
          type="button"
          onClick={onOpenProfile}
          title={`Profile & Settings (${currentUser?.name || 'Faculty'})`}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#DDE1DA] text-xs font-bold text-[#171819] shadow-2xs hover:bg-[#F8F9F7] cursor-pointer transition-transform hover:scale-102 active:scale-95"
        >
          <span className="w-5 h-5 rounded-full bg-[#191A1D] text-[#EDFF72] flex items-center justify-center text-[10px] font-extrabold">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
          </span>
          <span>{currentUser?.name || 'Faculty'}</span>
          <ChevronDown className="w-3 h-3 text-[#777D78]" />
        </button>
      </div>
    </header>
  );
};

export default BentoTopHeader;
