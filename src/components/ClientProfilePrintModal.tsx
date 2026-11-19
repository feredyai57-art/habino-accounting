import React, { useState } from 'react';
import { Check, Client, CompanySettings, Invoice } from '../types';
import { formatCurrency } from '../lib/currencyUtils';
import { X, Printer } from 'lucide-react';

interface ClientProfilePrintModalProps {
  mode: 'profile' | 'directory';
  clients: Client[];
  selectedClient?: Client;
  balances: ReadonlyMap<string, number>;
  canViewFinancials: boolean;
  settings: CompanySettings;
  invoices: Invoice[];
  checks: Check[];
  onClose: () => void;
}

type DirectoryTemplate = 'management' | 'delivery';

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fa-IR');
};

const getClientCoordinates = (client: Client) => ({
  lat: client.lat ?? client.latitude,
  lng: client.lng ?? client.longitude
});

export const ClientProfilePrintModal: React.FC<ClientProfilePrintModalProps> = ({
  mode,
  clients,
  selectedClient,
  balances,
  canViewFinancials,
  settings,
  invoices,
  checks,
  onClose
}) => {
  const [template, setTemplate] = useState<DirectoryTemplate>(
    canViewFinancials ? 'management' : 'delivery'
  );
  const [printError, setPrintError] = useState<string | null>(null);

  const activeTemplate = canViewFinancials ? template : 'delivery';
  const isProfile = mode === 'profile' && Boolean(selectedClient);
  const clientInvoices = isProfile
    ? invoices
      .filter(invoice => invoice.clientId === selectedClient?.id || invoice.client_id === selectedClient?.id)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
    : [];
  const clientChecks = isProfile
    ? checks
      .filter(check => check.clientId === selectedClient?.id)
      .slice()
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
      .slice(0, 5)
    : [];

  const handlePrint = () => {
    const printable = document.getElementById('client-profile-printable');
    if (!printable) {
      setPrintError('محتوای آماده چاپ پیدا نشد.');
      console.error('[ClientProfilePrintModal] Printable client content was not found.');
      return;
    }

    const printPortal = document.createElement('div');
    printPortal.id = 'habino-client-profile-print-portal';
    printPortal.appendChild(printable.cloneNode(true));
    document.body.appendChild(printPortal);
    document.body.classList.add('habino-client-profile-print');

    let cleanupTimer: number | undefined;
    const cleanup = () => {
      if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      printPortal.remove();
      document.body.classList.remove('habino-client-profile-print');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 60_000);
    window.print();
  };

  const renderClientProfile = (client: Client) => {
    const coordinates = getClientCoordinates(client);
    const balance = balances.get(client.id) ?? client.balance ?? 0;
    const recentInvoices = clientInvoices;
    const recentChecks = clientChecks;

    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Info label="نام طرف‌حساب" value={client.name} />
          <Info label="نوع شخص" value={client.type === 'corporate' ? 'حقوقی' : 'حقیقی'} />
          <Info label="شرکت / مجموعه" value={client.companyName} />
          <Info label="شماره تماس" value={client.phone} />
          <Info label="ایمیل" value={client.email} />
          <Info label="کد ملی / شناسه ملی" value={client.nationalCode} />
          <Info label="کد اقتصادی" value={client.economicCode} />
          <Info label="کد پستی" value={client.postalCode} />
          <Info label="نشانی" value={client.address} wide />
          {coordinates.lat !== undefined && coordinates.lng !== undefined && (
            <Info label="مختصات" value={`${coordinates.lat}, ${coordinates.lng}`} wide />
          )}
          {canViewFinancials && (
            <Info label="مانده حساب" value={formatCurrency(balance, settings.currency)} />
          )}
        </div>

        <section className="mt-6">
          <h3 className="mb-2 border-b border-slate-300 pb-2 text-sm font-bold">آخرین فاکتورها</h3>
          {recentInvoices.length ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <Th>شماره</Th>
                  <Th>تاریخ</Th>
                  <Th>وضعیت</Th>
                  {canViewFinancials && <Th>مبلغ</Th>}
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(invoice => (
                  <tr key={invoice.id}>
                    <Td>{invoice.invoiceNumber}</Td>
                    <Td>{formatDate(invoice.date)}</Td>
                    <Td>{invoice.status}</Td>
                    {canViewFinancials && <Td>{formatCurrency(invoice.grandTotal, settings.currency)}</Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-slate-500">فاکتوری ثبت نشده است.</p>}
        </section>

        <section className="mt-6">
          <h3 className="mb-2 border-b border-slate-300 pb-2 text-sm font-bold">آخرین چک‌ها</h3>
          {recentChecks.length ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <Th>شماره چک</Th>
                  <Th>بانک</Th>
                  <Th>سررسید</Th>
                  <Th>وضعیت</Th>
                  {canViewFinancials && <Th>مبلغ</Th>}
                </tr>
              </thead>
              <tbody>
                {recentChecks.map(check => (
                  <tr key={check.id}>
                    <Td>{check.checkNumber}</Td>
                    <Td>{check.bankName}</Td>
                    <Td>{formatDate(check.dueDate)}</Td>
                    <Td>{check.status}</Td>
                    {canViewFinancials && <Td>{formatCurrency(check.amount, settings.currency)}</Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-slate-500">چکی ثبت نشده است.</p>}
        </section>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-xs" dir="rtl">
      <div className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="client-profile-print-actions flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isProfile ? 'پروفایل کامل طرف‌حساب' : 'چاپ دفترچه مخاطبین'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isProfile ? selectedClient?.name : `${clients.length} مخاطب`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isProfile && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                قالب خروجی
                <select
                  value={activeTemplate}
                  onChange={event => {
                    if (event.target.value === 'management' || event.target.value === 'delivery') {
                      setTemplate(event.target.value);
                    }
                  }}
                  disabled={!canViewFinancials}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 disabled:bg-slate-100"
                >
                  {canViewFinancials && <option value="management">مدیریتی</option>}
                  <option value="delivery">ارسال کالا</option>
                </select>
              </label>
            )}
            <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
              <Printer className="h-4 w-4" />
              چاپ / ذخیره PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="بستن">
              <X className="h-4 w-4" />
            </button>
          </div>
          {printError && <p role="alert" className="w-full text-xs text-rose-700">{printError}</p>}
        </div>

        <div className="max-h-[75vh] overflow-auto p-4 sm:p-6">
          <article id="client-profile-printable" className="mx-auto max-w-[190mm] bg-white text-slate-900">
            <style>{`
              @media print {
                body.habino-client-profile-print > *:not(#habino-client-profile-print-portal) { display: none !important; }
                #habino-client-profile-print-portal { position: fixed !important; inset: 0 !important; z-index: 99999 !important; width: 100% !important; background: #fff !important; }
                #habino-client-profile-print-portal, #habino-client-profile-print-portal * { visibility: visible !important; }
                #habino-client-profile-print-portal #client-profile-printable { width: 100% !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
                .client-profile-print-actions { display: none !important; }
                .client-profile-print-section { break-inside: avoid; }
                .client-profile-print-table thead { display: table-header-group; }
                .client-profile-print-table tr { break-inside: avoid; }
                @page { size: A4; margin: 12mm; }
              }
            `}</style>
            <header className="mb-5 flex items-center justify-between gap-4 border-b-2 border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                {settings.logoUrl && <img src={settings.logoUrl} alt="" className="h-14 w-14 object-contain" />}
                <div>
                  <h1 className="text-lg font-bold">{settings.name || 'مجموعه اقتصادی'}</h1>
                  <p className="mt-1 text-xs text-slate-600">
                    {isProfile ? 'کارت شناسایی و اطلاعات طرف‌حساب' : activeTemplate === 'management' ? 'دفترچه مدیریتی مخاطبین' : 'دفترچه نشانی ارسال کالا'}
                  </p>
                </div>
              </div>
              <div className="text-left text-xs text-slate-600">
                <div>تاریخ چاپ: {new Date().toLocaleDateString('fa-IR')}</div>
                <div>تعداد مخاطبین: {isProfile ? 1 : clients.length}</div>
              </div>
            </header>

            {isProfile && selectedClient ? renderClientProfile(selectedClient) : (
              <table className="client-profile-print-table w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <Th>ردیف</Th>
                    <Th>نام / مجموعه</Th>
                    <Th>شماره تماس</Th>
                    <Th>نشانی</Th>
                    {activeTemplate === 'management' && <Th>کد ملی / شناسه</Th>}
                    <Th>کد پستی</Th>
                    {activeTemplate === 'management' && canViewFinancials && <Th>مانده حساب</Th>}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client, index) => {
                    const balance = balances.get(client.id) ?? client.balance ?? 0;
                    const coordinates = getClientCoordinates(client);
                    return (
                      <tr key={client.id}>
                        <Td>{index + 1}</Td>
                        <Td>
                          <strong>{client.name}</strong>
                          {client.companyName && <span className="block text-slate-500">{client.companyName}</span>}
                        </Td>
                        <Td>{client.phone || '—'}</Td>
                        <Td>
                          {client.address || '—'}
                          {activeTemplate === 'delivery' && coordinates.lat !== undefined && coordinates.lng !== undefined && (
                            <span className="mt-1 block text-slate-500">{coordinates.lat}, {coordinates.lng}</span>
                          )}
                        </Td>
                        {activeTemplate === 'management' && <Td>{client.nationalCode || '—'}</Td>}
                        <Td>{client.postalCode || '—'}</Td>
                        {activeTemplate === 'management' && canViewFinancials && (
                          <Td>{formatCurrency(balance, settings.currency)}</Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <footer className="client-profile-print-section mt-10 flex min-h-24 items-end justify-between gap-8 border-t border-slate-300 pt-4 text-xs">
              <div className="text-center">
                <div>امضا و مهر مجموعه</div>
                <div className="mt-2 flex items-center gap-3">
                  {settings.signatureUrl && <img src={settings.signatureUrl} alt="امضا" className="h-14 max-w-28 object-contain" />}
                  {settings.stampUrl && <img src={settings.stampUrl} alt="مهر" className="h-14 max-w-28 object-contain" />}
                </div>
              </div>
              <div className="text-left text-slate-500">گزارش تولیدشده توسط هابینو</div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
};

const Info: React.FC<{ label: string; value?: string | number; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={`client-profile-print-section rounded-lg border border-slate-200 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
    <div className="text-[10px] text-slate-500">{label}</div>
    <div className="mt-1 break-words text-xs font-semibold">{value || 'ثبت نشده'}</div>
  </div>
);

const Th: React.FC<React.PropsWithChildren> = ({ children }) => (
  <th className="border border-slate-400 bg-slate-100 p-2 text-right font-bold">{children}</th>
);

const Td: React.FC<React.PropsWithChildren> = ({ children }) => (
  <td className="border border-slate-300 p-2 align-top">{children}</td>
);
