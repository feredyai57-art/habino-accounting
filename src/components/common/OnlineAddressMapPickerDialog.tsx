import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed, Loader2, MapPin, Search, X } from 'lucide-react';
import { getSupabaseClient, getSupabaseConfig } from '../../lib/supabase';

export interface AddressMapSelection {
  address: string;
  lat?: number;
  lng?: number;
  city?: string;
  province?: string;
  neighbourhood?: string;
  postalCode?: string;
}

interface MapSearchItem {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
}

interface Coordinates {
  lat: number;
  lng: number;
}

export interface OnlineAddressMapPickerProps {
  value: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
  locale?: string;
  maxLength?: number;
  disabled?: boolean;
  onSelectAddress: (payload: AddressMapSelection) => void;
  label?: string;
}

interface MapApiResponse {
  available: boolean;
  provider: 'neshan' | 'google' | 'osm' | 'none';
  reason?: string;
  addonId?: string;
  formattedAddress?: string;
  province?: string;
  city?: string;
  neighbourhood?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  items?: MapSearchItem[];
  error?: string;
}

interface MapCanvasProps {
  apiKey: string;
  position: Coordinates;
  countryCode: string;
  locale: string;
  onPick: (coordinates: Coordinates) => void;
  onLoadError: () => void;
}

interface NeshanPoint {
  lat: number;
  lng: number;
}

interface NeshanMapInstance {
  on(event: string, handler: (event: { latlng: NeshanPoint }) => void): NeshanMapInstance;
  setView(center: [number, number], zoom?: number): NeshanMapInstance;
  invalidateSize(): NeshanMapInstance;
  remove(): void;
}

interface NeshanMarkerInstance {
  addTo(map: NeshanMapInstance): NeshanMarkerInstance;
  on(event: string, handler: () => void): NeshanMarkerInstance;
  getLatLng(): NeshanPoint;
  setLatLng(point: [number, number]): NeshanMarkerInstance;
}

interface NeshanLeaflet {
  Map: new (
    container: HTMLElement,
    options: { key: string; maptype: string; center: [number, number]; zoom: number }
  ) => NeshanMapInstance;
  marker: (point: [number, number], options?: { draggable?: boolean }) => NeshanMarkerInstance;
}

declare global {
  interface Window {
    L?: NeshanLeaflet;
  }
}

const GOOGLE_MAP_ID = 'DEMO_MAP_ID';
const NESHAN_SDK_SCRIPT_ID = 'habino-neshan-leaflet-sdk';
const NESHAN_SDK_CSS_ID = 'habino-neshan-leaflet-css';
let neshanSdkPromise: Promise<NeshanLeaflet> | null = null;

const loadNeshanSdk = (): Promise<NeshanLeaflet> => {
  if (window.L?.Map) return Promise.resolve(window.L);
  if (neshanSdkPromise) return neshanSdkPromise;

  neshanSdkPromise = new Promise<NeshanLeaflet>((resolve, reject) => {
    if (!document.getElementById(NESHAN_SDK_CSS_ID)) {
      const stylesheet = document.createElement('link');
      stylesheet.id = NESHAN_SDK_CSS_ID;
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/index.css';
      document.head.appendChild(stylesheet);
    }

    const finishLoading = () => {
      if (window.L?.Map) resolve(window.L);
      else reject(new Error('SDK نقشه نشان بارگذاری شد اما در دسترس نیست.'));
    };
    const existingScript = document.getElementById(NESHAN_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        finishLoading();
      } else {
        existingScript.addEventListener('load', finishLoading, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('بارگذاری نقشه نشان ناموفق بود.')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = NESHAN_SDK_SCRIPT_ID;
    script.src = 'https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/index.js';
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      finishLoading();
    };
    script.onerror = () => reject(new Error('بارگذاری نقشه نشان ناموفق بود.'));
    document.head.appendChild(script);
  }).catch(error => {
    neshanSdkPromise = null;
    throw error;
  });

  return neshanSdkPromise;
};

const getMapAccessToken = async (): Promise<string> => {
  if (!getSupabaseConfig().isConfigured) {
    throw new Error('اتصال امن برنامه برای جستجوی مکان پیکربندی نشده است.');
  }
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw new Error(`بازیابی نشست ناموفق بود: ${error.message}`);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('برای جستجوی مکان، ابتدا وارد حساب کاربری شوید.');
  return accessToken;
};

const callMapApi = async (path: string, query: Record<string, string>): Promise<MapApiResponse> => {
  if (!query.tenantId) throw new Error('فضای کاری فعال برای درخواست نقشه مشخص نیست.');
  const accessToken = await getMapAccessToken();
  const search = new URLSearchParams(query);
  const response = await fetch(`${path}?${search}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json().catch(() => null) as MapApiResponse | null;
  if (!response.ok && !['ADDON_REQUIRED', 'MAP_QUOTA_EXCEEDED', 'MAP_RATE_LIMIT_EXCEEDED'].includes(result?.reason || '')) {
    throw new Error(result?.error || `درخواست نقشه ناموفق بود (HTTP ${response.status}).`);
  }
  if (!result) {
    throw new Error(result?.error || `درخواست نقشه ناموفق بود (HTTP ${response.status}).`);
  }
  return result;
};

const getMapUnavailableMessage = (result: MapApiResponse, fallback: string): string => {
  if (result.reason === 'ADDON_REQUIRED') return 'برای استفاده از نقشه آنلاین، افزونه نقشه را از بخش افزونه‌ها فعال کنید.';
  if (result.reason === 'MAP_QUOTA_EXCEEDED') return 'سهمیه ماهانه درخواست‌های نقشه به پایان رسیده است؛ ماه آینده دوباره تلاش کنید.';
  if (result.reason === 'MAP_RATE_LIMIT_EXCEEDED') return 'درخواست‌های نقشه در این دقیقه بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.';
  if (result.reason === 'MAP_KEY_NOT_CONFIGURED') return 'سرویس نقشه فعلاً پیکربندی نشده است؛ نشانی را دستی وارد کنید.';
  return fallback;
};

const NeshanMapCanvas = lazy(async () => {
  const Component: React.FC<MapCanvasProps> = ({ apiKey, position, onPick, onLoadError }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<NeshanMapInstance | null>(null);
    const markerRef = useRef<NeshanMarkerInstance | null>(null);
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;

    useEffect(() => {
      let cancelled = false;
      let map: NeshanMapInstance | null = null;
      void loadNeshanSdk().then(L => {
        if (cancelled || !containerRef.current) return;
        const center: [number, number] = [position.lat, position.lng];
        map = new L.Map(containerRef.current, {
          key: apiKey,
          maptype: 'dreamy',
          center,
          zoom: 14
        });
        const marker = L.marker(center, { draggable: true }).addTo(map);
        map.on('click', event => onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
        marker.on('dragend', () => {
          const point = marker.getLatLng();
          onPickRef.current({ lat: point.lat, lng: point.lng });
        });
        mapRef.current = map;
        markerRef.current = marker;
        window.requestAnimationFrame(() => map?.invalidateSize());
      }).catch(() => {
        if (!cancelled) onLoadError();
      });

      return () => {
        cancelled = true;
        map?.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    }, [apiKey, onLoadError]);

    useEffect(() => {
      const center: [number, number] = [position.lat, position.lng];
      mapRef.current?.setView(center, 15);
      markerRef.current?.setLatLng(center);
    }, [position]);

    return <div ref={containerRef} className="h-full min-h-72 w-full rounded-xl" />;
  };
  return { default: Component };
});

const GoogleMapCanvas = lazy(async () => {
  const { APIProvider, AdvancedMarker, Map } = await import('@vis.gl/react-google-maps');
  const Component: React.FC<MapCanvasProps> = ({
    apiKey,
    position,
    countryCode,
    locale,
    onPick
  }) => (
    <APIProvider apiKey={apiKey} language={locale} region={countryCode}>
      <Map
        className="h-full min-h-72 w-full rounded-xl"
        center={position}
        zoom={14}
        mapId={GOOGLE_MAP_ID}
        onClick={event => {
          const point = event.detail.latLng;
          if (point) onPick({ lat: point.lat, lng: point.lng });
        }}
        gestureHandling="greedy"
        clickableIcons={false}
      >
        <AdvancedMarker
          position={position}
          draggable
          onDragEnd={event => {
            const point = event.latLng;
            if (point) onPick({ lat: point.lat, lng: point.lng });
          }}
        />
      </Map>
    </APIProvider>
  );
  return { default: Component };
});

const OsmMapCanvas = lazy(async () => {
  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');

  const createPinIcon = () =>
    L.divIcon({
      className: 'habino-osm-pin-icon',
      html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.45));">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="#ffffff"/>
        </svg>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });

  const Component: React.FC<MapCanvasProps> = ({ position, onPick, onLoadError }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<import('leaflet').Map | null>(null);
    const markerRef = useRef<import('leaflet').Marker | null>(null);
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;

    useEffect(() => {
      if (!containerRef.current) return;
      let map: import('leaflet').Map | null = null;
      try {
        map = L.map(containerRef.current, {
          center: [position.lat, position.lng],
          zoom: 15,
          zoomControl: true
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        const marker = L.marker([position.lat, position.lng], {
          draggable: true,
          icon: createPinIcon()
        }).addTo(map);

        map.on('click', event => {
          onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
        });
        marker.on('dragend', () => {
          const point = marker.getLatLng();
          onPickRef.current({ lat: point.lat, lng: point.lng });
        });

        mapRef.current = map;
        markerRef.current = marker;
        window.requestAnimationFrame(() => map?.invalidateSize());
      } catch {
        onLoadError();
      }

      return () => {
        map?.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    }, [onLoadError]);

    useEffect(() => {
      const target: [number, number] = [position.lat, position.lng];
      markerRef.current?.setLatLng(target);
      mapRef.current?.setView(target, Math.max(mapRef.current.getZoom(), 15), { animate: true });
    }, [position]);

    return <div ref={containerRef} className="h-full min-h-72 w-full rounded-xl z-0" />;
  };

  return { default: Component };
});

interface AddressMapDialogProps {
  value: string;
  initialPostalCode?: string;
  tenantId: string;
  lat?: number;
  lng?: number;
  countryCode: string;
  locale: string;
  maxLength?: number;
  apiKey: string;
  provider: 'neshan' | 'google' | 'osm';
  onClose: () => void;
  onSelectAddress: (payload: AddressMapSelection) => void;
}

export const OnlineAddressMapPickerDialog: React.FC<AddressMapDialogProps> = ({
  value,
  initialPostalCode,
  tenantId,
  lat,
  lng,
  countryCode,
  locale,
  maxLength,
  apiKey,
  provider,
  onClose,
  onSelectAddress
}) => {
    const initialPosition = countryCode === 'IR' ? { lat: 35.6892, lng: 51.389 } : { lat: 25.2048, lng: 55.2708 };
    const [position, setPosition] = useState<Coordinates>(() => (
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat as number, lng: lng as number } : initialPosition
    ));
    const [selectedAddress, setSelectedAddress] = useState(value);
    const [postalCode, setPostalCode] = useState(initialPostalCode || '');
    const [city, setCity] = useState('');
    const [province, setProvince] = useState('');
    const [neighbourhood, setNeighbourhood] = useState('');
    const [searchText, setSearchText] = useState(value);
    const [searchResults, setSearchResults] = useState<MapSearchItem[]>([]);
    const [notice, setNotice] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isResolving, setIsResolving] = useState(false);

    const handleCoordinates = useCallback(async (coordinates: Coordinates) => {
      setPosition(coordinates);
      setIsResolving(true);
      setNotice('');
      try {
        const result = await callMapApi('/api/maps/reverse-geocode', {
          tenantId,
          lat: String(coordinates.lat),
          lng: String(coordinates.lng),
          country: countryCode,
          lang: locale
        });
        if (!result.available) {
          setNotice(getMapUnavailableMessage(result, 'تبدیل خودکار مختصات به نشانی در دسترس نیست؛ نشانی را دستی وارد کنید.'));
          return;
        }
        setSelectedAddress((result.formattedAddress || '').slice(0, maxLength ?? Infinity));
        setSearchText(result.formattedAddress || '');
        setCity(result.city || '');
        setProvince(result.province || '');
        setNeighbourhood(result.neighbourhood || '');
        setPostalCode(result.postalCode || '');
        if (!result.formattedAddress) setNotice('نشانی برای این نقطه پیدا نشد؛ می‌توانید آن را دستی وارد کنید.');
      } catch {
        setNotice('نشانی خودکار دریافت نشد؛ امکان درج دستی همچنان برقرار است.');
      } finally {
        setIsResolving(false);
      }
    }, [countryCode, locale, maxLength, tenantId]);

    const searchPlaces = async () => {
      const query = searchText.trim();
      if (query.length < 2) {
        setNotice('برای جستجو، دست‌کم دو نویسه وارد کنید.');
        return;
      }
      setIsSearching(true);
      setSearchResults([]);
      setNotice('');
      try {
        const result = await callMapApi('/api/maps/search', {
          tenantId,
          q: query,
          country: countryCode,
          lang: locale,
          lat: String(position.lat),
          lng: String(position.lng)
        });
        if (!result.available) {
          setNotice(getMapUnavailableMessage(result, 'جستجوی مکان در دسترس نیست؛ نشانی را دستی وارد کنید.'));
          return;
        }
        const items = result.items || [];
        setSearchResults(items);
        if (items.length === 0) setNotice('مکانی پیدا نشد؛ عبارت دیگری را جستجو کنید.');
      } catch {
        setNotice('جستجوی مکان انجام نشد؛ عبارت دیگری را امتحان کنید یا نشانی را دستی وارد کنید.');
      } finally {
        setIsSearching(false);
      }
    };

    const applySearchResult = (item: MapSearchItem) => {
      setPosition({ lat: item.lat, lng: item.lng });
      setSelectedAddress((item.address || item.title).slice(0, maxLength ?? Infinity));
      setSearchText(item.address || item.title);
      setCity('');
      setProvince('');
      setNeighbourhood('');
      setPostalCode('');
      setSearchResults([]);
      setNotice('');
    };

    const locateCurrentPosition = () => {
      if (!navigator.geolocation) {
        setNotice('مرورگر شما به موقعیت‌یابی مکانی دسترسی ندارد.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        result => void handleCoordinates({ lat: result.coords.latitude, lng: result.coords.longitude }),
        error => {
          const message = error.code === error.PERMISSION_DENIED
            ? 'اجازهٔ دسترسی به موقعیت مکانی داده نشد.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'موقعیت فعلی در دسترس نیست.'
              : 'دریافت موقعیت بیش از حد طول کشید؛ دوباره تلاش کنید.';
          setNotice(message);
        },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    };

    const confirmSelection = () => {
      onSelectAddress({
        address: selectedAddress.trim().slice(0, maxLength ?? Infinity),
        lat: position.lat,
        lng: position.lng,
        city: city || undefined,
        province: province || undefined,
        neighbourhood: neighbourhood || undefined,
        postalCode: postalCode.trim() || undefined
      });
    };

    const MapCanvas = provider === 'neshan' ? NeshanMapCanvas : provider === 'google' ? GoogleMapCanvas : OsmMapCanvas;
    const handleMapLoadError = useCallback(
      () => setNotice('نمایش نقشه در دسترس نیست؛ نشانی را می‌توانید به‌صورت دستی وارد کنید.'),
      []
    );

    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5"
        dir={locale.startsWith('fa') || locale.startsWith('ar') ? 'rtl' : 'ltr'}
        onClick={onClose}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="address-map-title"
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="address-map-title" className="flex items-center gap-2 text-start text-sm font-bold text-slate-800">
                <MapPin className="h-4 w-4 text-blue-600" />
                انتخاب نشانی از روی نقشه
              </h2>
              {provider === 'osm' && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                  نقشه آزاد OpenStreetMap (بدون نیاز به API Key)
                </span>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="بستن" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 p-4">
            <div className="flex gap-2" role="search">
              <input
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchPlaces();
                  }
                }}
                placeholder="جستجوی شهر یا مکان"
                aria-label="جستجوی مکان روی نقشه"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2.5 text-start text-xs"
              />
              <button
                type="button"
                onClick={() => void searchPlaces()}
                disabled={isSearching}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                جستجو
              </button>
            </div>
            {searchResults.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
                {searchResults.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => applySearchResult(item)}
                      className="w-full rounded-md p-2 text-start text-xs text-slate-700 hover:bg-blue-50"
                    >
                      <span className="block font-semibold">{item.title}</span>
                      <span className="block text-slate-500">{item.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-start">
              <button
                type="button"
                onClick={locateCurrentPosition}
                disabled={isResolving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {isResolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                موقعیت فعلی من (GPS)
              </button>
            </div>
            <div className="h-72 w-full overflow-hidden rounded-xl">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-500">در حال بارگذاری نقشه…</div>}>
                <MapCanvas
                  apiKey={apiKey}
                  position={position}
                  countryCode={countryCode}
                  locale={locale}
                  onPick={coordinates => void handleCoordinates(coordinates)}
                  onLoadError={handleMapLoadError}
                />
              </Suspense>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              برای نشانی شخصی یا محرمانه، آن را دستی وارد کنید.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
              <textarea
                rows={2}
                value={selectedAddress}
                maxLength={maxLength}
                onChange={event => setSelectedAddress(event.target.value)}
                placeholder="نشانی انتخاب‌شده (قابل ویرایش)"
                className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-start text-xs outline-none focus:border-blue-400"
              />
              <input
                value={postalCode}
                onChange={event => setPostalCode(event.target.value)}
                placeholder="کد پستی (اختیاری)"
                className="h-10 w-full rounded-lg border border-slate-200 p-2.5 text-start text-xs outline-none focus:border-blue-400"
              />
            </div>
            {notice && <p role="status" className="text-start text-xs leading-5 text-amber-700">{notice}</p>}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <span className="text-[11px] text-slate-500" dir="ltr">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmSelection}
                disabled={!selectedAddress.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                تأیید و درج آدرس در فرم
              </button>
            </div>
          </footer>
        </section>
      </div>
    );
};

