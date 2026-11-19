import React, { useEffect, useState } from 'react';
import { Eye, LogOut, ShieldAlert } from 'lucide-react';
import { useAccounting } from '../lib/store';

interface PlatformImpersonationBannerProps {
  onShowTenantPreview?: () => void;
}

export const PlatformImpersonationBanner: React.FC<PlatformImpersonationBannerProps> = ({ onShowTenantPreview }) => {
  const { activeTenant, impersonationSession, exitImpersonation } = useAccounting();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!impersonationSession?.isActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [impersonationSession?.isActive]);

  if (!impersonationSession?.isActive || !impersonationSession.expiresAt) return null;

  const remainingMs = Math.max(0, new Date(impersonationSession.expiresAt).getTime() - now);
  const remainingMinutes = Math.floor(remainingMs / 60_000);
  const remainingSeconds = Math.floor((remainingMs % 60_000) / 1000);
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-950 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 text-xs font-bold">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>مشاهدهٔ پشتیبانی فقط‌خواندنی: {activeTenant?.name || 'مستأجر'}</span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5">
          زمان باقی‌مانده: {String(remainingMinutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
        </span>
      </div>
      {isAdminRoute && onShowTenantPreview && (
        <button
          type="button"
          onClick={onShowTenantPreview}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800"
        >
          <Eye className="h-3.5 w-3.5" />
          نمایش صفحه مستأجر
        </button>
      )}
      <button
        type="button"
        onClick={() => void exitImpersonation()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-950"
      >
        <LogOut className="h-3.5 w-3.5" />
        خروج از حالت پشتیبانی
      </button>
    </div>
  );
};

export default PlatformImpersonationBanner;
