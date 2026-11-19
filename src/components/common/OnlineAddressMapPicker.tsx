import React, { lazy, Suspense, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAccounting } from '../../lib/store';
import type { OnlineAddressMapPickerProps } from './OnlineAddressMapPickerDialog';

const AddressMapDialog = lazy(() =>
  import('./OnlineAddressMapPickerDialog').then(module => ({
    default: module.OnlineAddressMapPickerDialog
  }))
);
const UpgradeModal = lazy(() =>
  import('../UpgradeModal').then(module => ({ default: module.UpgradeModal }))
);

const NESHAN_MAP_API_KEY = import.meta.env.VITE_NESHAN_WEB_API_KEY?.trim() || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';

export const OnlineAddressMapPicker: React.FC<OnlineAddressMapPickerProps> = ({
  value,
  postalCode,
  lat,
  lng,
  countryCode = 'IR',
  locale = 'fa',
  maxLength,
  disabled = false,
  onSelectAddress,
  label = 'نشانی'
}) => {
  const { activeTenant, hasAddon } = useAccounting();
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const hasGeoMapping = hasAddon('addon_geo_mapping');
  const tenantId = activeTenant?.id || '';
  const normalizedCountry = countryCode.trim().toUpperCase();
  const provider: 'neshan' | 'google' | 'osm' =
    normalizedCountry === 'IR' && NESHAN_MAP_API_KEY
      ? 'neshan'
      : normalizedCountry !== 'IR' && GOOGLE_MAPS_API_KEY
        ? 'google'
        : 'osm';
  const apiKey = provider === 'neshan' ? NESHAN_MAP_API_KEY : provider === 'google' ? GOOGLE_MAPS_API_KEY : '';
  const directionsHref = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
    : undefined;

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const openPicker = () => {
    if (!hasGeoMapping) {
      setIsUpsellOpen(true);
      return;
    }
    if (!isOnline) {
      setNotice('برای استفاده از نقشه به اینترنت نیاز است؛ ورود دستی نشانی همچنان فعال است.');
      return;
    }
    setNotice('');
    setIsOpen(true);
  };

  return (
    <div className="mt-2 space-y-1" dir={locale.startsWith('fa') || locale.startsWith('ar') ? 'rtl' : 'ltr'}>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={`انتخاب ${label} از روی نقشه آنلاین`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-start text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MapPin className="h-3.5 w-3.5" />
        {hasGeoMapping ? 'انتخاب روی نقشه' : 'انتخاب روی نقشه (افزونه)'}
      </button>
      {hasGeoMapping && directionsHref && (
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg px-2 py-2 text-start text-xs font-semibold text-blue-700 underline underline-offset-2"
        >
          مسیریابی روی نقشه
        </a>
      )}
      {notice && <p role="status" className="text-start text-[11px] leading-5 text-amber-700">{notice}</p>}
      {!hasGeoMapping && isUpsellOpen && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-start" aria-label="معرفی افزونه نقشه آنلاین">
          <p className="text-xs font-bold text-indigo-900">افزونه نقشه آنلاین</p>
          <p className="mt-1 text-[11px] leading-5 text-indigo-800">
            جستجوی مکان، ثبت مختصات و لینک مسیریابی مشتریان را فعال می‌کند. ورود دستی نشانی همیشه رایگان و در دسترس است.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUpgradeOpen(true)}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              مشاهده و فعال‌سازی افزونه
            </button>
            <button
              type="button"
              onClick={() => setIsUpsellOpen(false)}
              className="rounded-lg px-3 py-2 text-xs text-indigo-800 hover:bg-indigo-100"
            >
              بستن
            </button>
          </div>
        </section>
      )}
      {isUpgradeOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 text-sm text-white">در حال بارگذاری بخش افزونه‌ها…</div>}>
          <UpgradeModal isOpen onClose={() => setIsUpgradeOpen(false)} initialTab="addons" />
        </Suspense>
      )}
      {isOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 text-sm text-white">در حال بارگذاری نقشه…</div>}>
          <AddressMapDialog
            value={value}
            initialPostalCode={postalCode}
            tenantId={tenantId}
            lat={lat}
            lng={lng}
            countryCode={normalizedCountry}
            locale={locale}
            maxLength={maxLength}
            apiKey={apiKey}
            provider={provider}
            onClose={() => setIsOpen(false)}
            onSelectAddress={payload => {
              onSelectAddress(payload);
              setIsOpen(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
