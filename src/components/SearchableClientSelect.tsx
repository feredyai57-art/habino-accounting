import React, { useState, useRef, useEffect, useId } from 'react';
import { Client } from '../types';
import { Search, ChevronDown, Check, User, Building, X } from 'lucide-react';

interface SearchableClientSelectProps {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onQuickAddClient?: (suggestedName?: string) => void;
  recentClientIds?: string[];
}

export const SearchableClientSelect: React.FC<SearchableClientSelectProps> = ({
  clients,
  value,
  onChange,
  label = 'طرف‌حساب',
  placeholder = 'جستجو و انتخاب طرف‌حساب...',
  required = false,
  className = '',
  onQuickAddClient,
  recentClientIds = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectId = useId();

  const selectedClient = clients.find(c => c.id === value);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const filteredClients = clients.filter(c => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const companyMatch = (c.companyName || '').toLowerCase().includes(q);
    const phoneMatch = (c.phone || '').toLowerCase().includes(q);
    const nationalCodeMatch = (c.nationalCode || '').toLowerCase().includes(q);
    const economicCodeMatch = (c.economicCode || '').toLowerCase().includes(q);
    const emailMatch = (c.email || '').toLowerCase().includes(q);
    return nameMatch || companyMatch || phoneMatch || nationalCodeMatch || economicCodeMatch || emailMatch;
  });
  const recentClientIdSet = new Set(recentClientIds);
  const recentClients = search.trim()
    ? []
    : filteredClients.filter(client => recentClientIdSet.has(client.id));
  const otherClients = recentClients.length > 0
    ? filteredClients.filter(client => !recentClientIdSet.has(client.id))
    : filteredClients;

  const handleSelect = (clientId: string) => {
    onChange(clientId);
    setIsOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const renderClientOption = (client: Client) => {
    const isSelected = client.id === value;
    return (
      <button
        key={client.id}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => handleSelect(client.id)}
        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-right cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50/80 text-blue-900 font-medium'
            : 'hover:bg-slate-50 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <div className={`p-1.5 rounded-lg shrink-0 ${
            client.type === 'corporate' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'
          }`}>
            {client.type === 'corporate' ? (
              <Building className="w-3.5 h-3.5" />
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="truncate text-right">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <span>{client.name}</span>
              {client.companyName && (
                <span className="text-[10px] text-slate-400 font-normal">
                  ({client.companyName})
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {client.phone || 'بدون شماره تماس'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 mr-2">
          {!search.trim() && recentClientIdSet.has(client.id) && (
            <span className="text-[9px] text-blue-600">اخیر</span>
          )}
          <span className={`text-[10px] font-mono font-medium ${
            (client.balance || 0) > 0 ? 'text-rose-600' : (client.balance || 0) < 0 ? 'text-emerald-600' : 'text-slate-400'
          }`}>
            {(client.balance || 0) > 0 ? 'بدهکار' : (client.balance || 0) < 0 ? 'بستانکار' : 'بی‌حساب'}
          </span>
          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
        </div>
      </button>
    );
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={`${selectId}-trigger`} className="block text-xs font-semibold text-slate-600 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          ref={triggerRef}
          id={`${selectId}-trigger`}
          type="button"
          aria-label={selectedClient ? `${label}: ${selectedClient.name}` : placeholder}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${selectId}-listbox`}
          aria-required={required}
          onClick={() => setIsOpen(open => !open)}
          className={`w-full p-2.5 pl-14 bg-slate-50 border border-slate-200 rounded-xl text-sm flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-all ${
          isOpen ? 'ring-2 ring-blue-500/20 border-blue-500 bg-white' : ''
        }`}
        >
          <div className="flex items-center gap-2 overflow-hidden text-right">
            {selectedClient ? (
              <div className="flex items-center gap-2 truncate">
                <span className="p-1 rounded-md bg-blue-100 text-blue-700 text-xs shrink-0">
                  {selectedClient.type === 'corporate' ? <Building className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                </span>
                <span className="font-semibold text-slate-800 text-xs truncate">
                  {selectedClient.name}
                </span>
                {selectedClient.companyName && (
                  <span className="text-[11px] text-slate-400 truncate">
                    ({selectedClient.companyName})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400 text-xs">{placeholder}</span>
            )}
          </div>
          <ChevronDown className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>
        {selectedClient && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute left-8 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
            title="پاک کردن انتخاب"
            aria-label="پاک کردن طرف‌حساب انتخاب‌شده"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                autoFocus
                placeholder="جستجوی سریع نام، شرکت، شماره تماس..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearch('');
                    triggerRef.current?.focus();
                  }
                }}
                className="w-full pl-3 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-sans"
              />
            </div>
          </div>

          {/* List of Clients */}
          <div id={`${selectId}-listbox`} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto divide-y divide-slate-50 p-1">
            {filteredClients.length === 0 ? (
              <div className="p-4 text-center text-xs space-y-2.5">
                <div className="text-slate-400">طرف‌حسابی با این مشخصات یافت نشد.</div>
                {onQuickAddClient && (
                  <button
                    type="button"
                    onClick={() => {
                      const nameToUse = search.trim();
                      setIsOpen(false);
                      onQuickAddClient(nameToUse);
                    }}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer border border-blue-200"
                  >
                    + تعریف «{search.trim() || 'طرف‌حساب جدید'}»
                  </button>
                )}
              </div>
            ) : (
              <>
                {recentClients.length > 0 && (
                  <div className="px-2 py-1.5 text-[10px] font-bold text-blue-700">مخاطبان اخیر</div>
                )}
                {recentClients.map(renderClientOption)}
                {recentClients.length > 0 && otherClients.length > 0 && (
                  <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500">همه طرف‌حساب‌ها</div>
                )}
                {otherClients.map(renderClientOption)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
