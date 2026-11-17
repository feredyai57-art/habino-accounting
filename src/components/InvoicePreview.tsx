import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { Invoice, InvoiceDesignConfig, InvoiceTemplate } from '../types';
import { useAccounting } from '../lib/store';
import { formatCurrency, toPersianDigits } from '../lib/currencyUtils';
import { calculateItemTotal } from '../lib/calculations';
import { InvoiceSettingsModal } from './InvoiceSettingsModal';
import { 
  Printer, 
  X, 
  Sliders, 
  FileDown, 
  Image, 
  Loader2, 
  Check, 
  AlertCircle,
  Trash2,
  FileText,
  CreditCard,
  FileSpreadsheet,
  PenTool,
  Share2,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { exportSingleInvoiceToCsv } from '../lib/exportUtils';
import { PhysicalSignatureCanvas, SignatureDataPayload } from './PhysicalSignatureCanvas';
import { ShareInvoiceModal } from './ShareInvoiceModal';
import { uploadAndRecordSignature } from '../lib/signatureService';
import { getSupabaseConfig } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { getClientBalanceBeforeInvoice } from '../lib/clientLedger';
import { getInvoiceBalanceDelta } from '../lib/invoiceBalance';
import { formatDocumentTime } from '../lib/documentTime';

export type PaperFormat = 'a4' | 'a5_portrait' | 'a5_landscape';

const isInvoiceTemplate = (value: string): value is InvoiceTemplate =>
  value === 'professional' ||
  value === 'modern' ||
  value === 'minimal' ||
  value === 'classic' ||
  value === 'executive' ||
  value === 'atelier' ||
  value === 'nordic';

interface InvoicePreviewProps {
  invoice: Invoice;
  onClose: () => void;
  onOpenCustomizer?: () => void;
  onDelete?: () => void;
  isInline?: boolean;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({ 
  invoice: initialInvoice, 
  onClose, 
  onOpenCustomizer,
  onDelete,
  isInline = false
}) => {
  const { settings, clients, accountingEntries, updateInvoice, activeTenantId, currentUser } = useAccounting();
  const printRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewSheetRef = useRef<HTMLDivElement>(null);
  const previewDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [previewSheetSize, setPreviewSheetSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [previewOffset, setPreviewOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState<boolean>(false);

  const [invoice, setInvoice] = useState<Invoice>(initialInvoice);
  const [showCustomizer, setShowCustomizer] = useState<boolean>(false);
  const [showSignatureCanvas, setShowSignatureCanvas] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [isSavingSignature, setIsSavingSignature] = useState<boolean>(false);
  const [isPrintPortalReady, setIsPrintPortalReady] = useState<boolean>(() =>
    !isInline &&
    typeof document !== 'undefined' &&
    (document.body.classList.contains('habino-print-active') ||
      document.body.classList.contains('is-printing-invoice'))
  );

  useEffect(() => {
    setInvoice(initialInvoice);
  }, [initialInvoice]);

  const handleSaveSignature = async (payload: SignatureDataPayload) => {
    setIsSavingSignature(true);
    try {
      const result = await uploadAndRecordSignature({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        blob: payload.blob,
        dataUrl: payload.dataUrl,
        signerName: payload.signerName,
        signerRole: payload.signerRole,
        signerNationalId: payload.signerNationalId,
        tenantId: activeTenantId || 'tenant-main',
        signedAt: payload.signedAt,
        signatureHash: payload.signatureHash
      });

      const updatedInvoiceFields: Partial<Invoice> = {
        signatureUrl: result.signatureUrl,
        isSigned: true,
        signedAt: payload.signedAt,
        shareToken: result.shareToken,
        signatureMetadata: {
          signatureId: result.signatureRecord?.id,
          signerName: payload.signerName,
          signerRole: payload.signerRole,
          signerNationalId: payload.signerNationalId,
          signatureHash: payload.signatureHash
        }
      };

      // آپدیت ایمن و مستقیم در Supabase جهت ماندگاری ۱۰۰٪ پس از رفرش
      const config = getSupabaseConfig();
      if (config.isConfigured && config.url && config.key) {
        const supabase = createClient(config.url, config.key);
        await supabase
          .from('invoices')
          .update({
            signature_url: result.signatureUrl,
            is_signed: true,
            signed_at: payload.signedAt,
            share_token: result.shareToken
          })
          .eq('id', invoice.id);
      }

      await updateInvoice(invoice.id, updatedInvoiceFields);
      setInvoice((prev) => ({
        ...prev,
        ...updatedInvoiceFields
      }));

      setShowSignatureCanvas(false);
      setFeedbackMsg({
        type: 'success',
        text: 'امضای فیزیکی و تایید رسمی سند با موفقیت در پایگاه داده ثبت و ماندگار شد.'
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'خطا در ثبت امضای فاکتور.'
      });
    } finally {
      setIsSavingSignature(false);
    }
  };

  const [paperSize, setPaperSize] = useState<PaperFormat>('a4');
  const [isPreviewMaximized, setIsPreviewMaximized] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownloadCsv = () => {
    try {
      const relatedEntries = accountingEntries.filter(e => e.referenceId === invoice.id);
      exportSingleInvoiceToCsv(invoice, settings, relatedEntries);
      setFeedbackMsg({
        type: 'success',
        text: `فایل اکسل / CSV سند شماره #${invoice.invoiceNumber} با موفقیت صادر شد.`
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: 'خطا در صدور فایل اکسل سند.'
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  useEffect(() => {
    if (!isInline) {
      document.body.classList.add('habino-invoice-modal-open');
    }
    return () => {
      document.body.classList.remove('habino-invoice-modal-open');
      document.body.classList.remove('habino-print-active');
      document.body.classList.remove('is-printing-invoice');
    };
  }, [isInline]);

  useEffect(() => {
    if (!isPrintPortalReady) return;
    const resetPrintPortal = () => setIsPrintPortalReady(false);
    window.addEventListener('afterprint', resetPrintPortal, { once: true });
    return () => window.removeEventListener('afterprint', resetPrintPortal);
  }, [isPrintPortalReady]);

  const client = clients.find(c => c.id === invoice.clientId);

  const design: InvoiceDesignConfig = {
    primaryColor: invoice.designConfig?.primaryColor || settings.defaultInvoiceDesign?.primaryColor || '#1e40af',
    fontFamily: invoice.designConfig?.fontFamily || settings.defaultInvoiceDesign?.fontFamily || 'vazir',
    showLogo: invoice.designConfig?.showLogo ?? settings.defaultInvoiceDesign?.showLogo ?? true,
    showStamp: invoice.designConfig?.showStamp ?? settings.defaultInvoiceDesign?.showStamp ?? true,
    showSignature: invoice.designConfig?.showSignature ?? settings.defaultInvoiceDesign?.showSignature ?? true,
    showWatermark: invoice.designConfig?.showWatermark ?? settings.defaultInvoiceDesign?.showWatermark ?? true,
    showTaxColumn: invoice.designConfig?.showTaxColumn ?? settings.defaultInvoiceDesign?.showTaxColumn ?? true,
    showDiscountColumn: invoice.designConfig?.showDiscountColumn ?? settings.defaultInvoiceDesign?.showDiscountColumn ?? true,
    showPreviousBalance: invoice.designConfig?.showPreviousBalance ?? settings.defaultInvoiceDesign?.showPreviousBalance ?? true,
    headerTitle: invoice.designConfig?.headerTitle || settings.defaultInvoiceDesign?.headerTitle || '',
    notesTitle: (invoice.designConfig?.notesTitle || settings.defaultInvoiceDesign?.notesTitle || 'توضیحات:').replace(/و\s*شرایط\s*تسویه/g, '').trim() || 'توضیحات:',
    signatureSignerTitle: invoice.designConfig?.signatureSignerTitle || settings.defaultInvoiceDesign?.signatureSignerTitle || 'مهر و امضای مجاز صادرکننده'
  };

  const resolvedNotes = (invoice.notes && invoice.notes.trim()) || (settings.invoiceNote && settings.invoiceNote.trim()) || '';
  const resolvedTerms = (invoice.terms && invoice.terms.trim()) || (settings.invoiceTerms && settings.invoiceTerms.trim()) || '';

  const resolvedGrandTotal = design.showTaxColumn
    ? invoice.grandTotal
    : invoice.subtotal - invoice.totalDiscount;
  const resolvedRemainingAmount = design.showTaxColumn
    ? invoice.remainingAmount
    : Math.max(0, resolvedGrandTotal - invoice.amountPaid);
  const invoiceBalanceDelta = getInvoiceBalanceDelta(invoice.type, resolvedRemainingAmount);
  const resolvedPreviousBalance = client
    ? getClientBalanceBeforeInvoice(
        accountingEntries,
        invoice,
        invoice.previousBalance ?? client.balance ?? 0,
        client.name
      )
    : invoice.previousBalance ?? 0;

  const resolvedTotalDebt = resolvedPreviousBalance + invoiceBalanceDelta;

  const getBalanceStatusText = (val: number) => {
    if (val > 0) return '(بدهکار)';
    if (val < 0) return '(بستانکار)';
    return '(تسویه)';
  };

  const requestedTemplate = invoice.template || settings.defaultInvoiceTemplate || 'professional';
  const activeTemplate = isInvoiceTemplate(requestedTemplate) ? requestedTemplate : 'professional';
  const templatePresentation: Record<InvoiceTemplate, {
    label: string;
    frame: string;
    ribbon: string;
    tableHeader: string;
    partyCard: string;
    totalsCard: string;
  }> = {
    professional: {
      label: 'قالب حرفه‌ای',
      frame: 'border border-slate-200 rounded-2xl',
      ribbon: 'bg-blue-50 text-blue-800 border-blue-100',
      tableHeader: 'bg-slate-100 text-slate-700 border-slate-200',
      partyCard: 'bg-slate-50 border-slate-100',
      totalsCard: 'bg-slate-50 border-slate-200'
    },
    modern: {
      label: 'طراحی مدرن',
      frame: 'border border-indigo-100 rounded-[2rem] shadow-sm',
      ribbon: 'bg-indigo-50 text-indigo-800 border-indigo-100',
      tableHeader: 'bg-indigo-50 text-indigo-900 border-indigo-100',
      partyCard: 'bg-indigo-50/50 border-indigo-100 rounded-2xl',
      totalsCard: 'bg-indigo-50/50 border-indigo-100 rounded-2xl'
    },
    minimal: {
      label: 'طراحی مینیمال',
      frame: 'border-y border-slate-300 rounded-none shadow-none',
      ribbon: 'bg-slate-50 text-slate-700 border-slate-200 rounded-none',
      tableHeader: 'bg-white text-slate-700 border-slate-300 border-y-2',
      partyCard: 'bg-white border-slate-200 rounded-none',
      totalsCard: 'bg-white border-slate-300 rounded-none'
    },
    classic: {
      label: 'قالب کلاسیک بازار',
      frame: 'border-[3px] border-double border-amber-700 rounded-none',
      ribbon: 'bg-amber-50 text-amber-900 border-amber-200 rounded-none',
      tableHeader: 'bg-amber-50 text-amber-950 border-amber-300 border-y-2',
      partyCard: 'bg-amber-50/50 border-amber-200 rounded-none',
      totalsCard: 'bg-amber-50/50 border-amber-300 rounded-none'
    },
    executive: {
      label: 'امپریال مدیریتی',
      frame: 'border border-slate-300 border-t-8 rounded-lg shadow-lg',
      ribbon: 'bg-slate-900 text-amber-200 border-slate-800 rounded-md',
      tableHeader: 'bg-slate-900 text-white border-slate-800',
      partyCard: 'bg-slate-50 border-slate-200 rounded-lg',
      totalsCard: 'bg-slate-50 border-slate-300 rounded-lg'
    },
    atelier: {
      label: 'آتلیه گرم',
      frame: 'border border-rose-200 rounded-[2rem] bg-[#fffdf8]',
      ribbon: 'bg-rose-50 text-rose-900 border-rose-100 rounded-xl',
      tableHeader: 'bg-rose-50 text-rose-900 border-rose-200',
      partyCard: 'bg-[#fff9f5] border-rose-100 rounded-2xl',
      totalsCard: 'bg-[#fff9f5] border-rose-200 rounded-2xl'
    },
    nordic: {
      label: 'نوردیک آرام',
      frame: 'border border-teal-100 rounded-[1.75rem] shadow-sm',
      ribbon: 'bg-teal-50 text-teal-900 border-teal-100 rounded-xl',
      tableHeader: 'bg-teal-50 text-teal-900 border-teal-100',
      partyCard: 'bg-teal-50/40 border-teal-100 rounded-2xl',
      totalsCard: 'bg-teal-50/40 border-teal-100 rounded-2xl'
    }
  };
  const presentation = templatePresentation[activeTemplate];

  const handlePrint = () => {
    document.body.classList.add('habino-print-active');
    document.body.classList.add('is-printing-invoice');
    setIsPrintPortalReady(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsPrintPortalReady(false);
        document.body.classList.remove('is-printing-invoice');
        document.body.classList.remove('habino-print-active');
      }, 1200);
    }, 150);
  };

  const captureFullInvoiceCanvas = async (element: HTMLElement): Promise<HTMLCanvasElement> => {
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch (e) {
        console.warn('Font loading wait skipped:', e);
      }
    }

    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(
        img =>
          new Promise<void>(resolve => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );

    const scrollContainer = (element.closest('.printable-invoice-container') || element.closest('.overflow-y-auto')) as HTMLElement | null;
    const originalScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    const fullWidth = element.scrollWidth || element.offsetWidth || 800;
    let maxChildBottom = 0;
    const elemRect = element.getBoundingClientRect();
    const allDescendants = element.querySelectorAll('*');
    allDescendants.forEach(child => {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const bottomOffset = rect.bottom - elemRect.top;
      if (bottomOffset > maxChildBottom) {
        maxChildBottom = bottomOffset;
      }
    });

    const targetHeight = Math.ceil(
      Math.max(element.scrollHeight, element.offsetHeight, maxChildBottom + 40)
    );

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: fullWidth,
        height: targetHeight,
        windowWidth: fullWidth + 120,
        windowHeight: targetHeight + 200,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const noPrints = clonedDoc.querySelectorAll('.no-print');
          noPrints.forEach((el: any) => {
            el.style.display = 'none';
            el.style.height = '0px';
            el.style.margin = '0px';
            el.style.padding = '0px';
            el.style.overflow = 'hidden';
          });

          const clonedEl = clonedDoc.getElementById('printable-invoice');
          if (clonedEl) {
            let curr: HTMLElement | null = clonedEl.parentElement;
            while (curr && curr !== clonedDoc.documentElement) {
              curr.style.maxHeight = 'none';
              curr.style.height = 'auto';
              curr.style.overflow = 'visible';
              curr.style.position = 'static';
              curr.style.transform = 'none';
              curr.style.margin = '0';
              curr.style.padding = '0';
              curr.style.boxShadow = 'none';
              curr = curr.parentElement;
            }

            if (clonedDoc.body) {
              clonedDoc.body.style.maxHeight = 'none';
              clonedDoc.body.style.height = 'auto';
              clonedDoc.body.style.overflow = 'visible';
              clonedDoc.body.style.margin = '0';
              clonedDoc.body.style.padding = '0';
            }

            if (clonedDoc.documentElement) {
              clonedDoc.documentElement.style.maxHeight = 'none';
              clonedDoc.documentElement.style.height = 'auto';
              clonedDoc.documentElement.style.overflow = 'visible';
            }

            clonedEl.style.maxHeight = 'none';
            clonedEl.style.height = 'auto';
            clonedEl.style.minHeight = `${targetHeight}px`;
            clonedEl.style.overflow = 'visible';
            clonedEl.style.position = 'static';
            clonedEl.style.width = `${fullWidth}px`;
            clonedEl.style.maxWidth = 'none';
            clonedEl.style.margin = '0';
            clonedEl.style.boxShadow = 'none';
            clonedEl.style.paddingBottom = '32px';
            clonedEl.style.fontFamily = "'Vazirmatn', system-ui, -apple-system, sans-serif";
          }
        }
      });

      return canvas;
    } finally {
      if (scrollContainer) {
        scrollContainer.scrollTop = originalScrollTop;
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsDownloadingPdf(true);
    setFeedbackMsg(null);
    try {
      const element = printRef.current;
      const canvas = await captureFullInvoiceCanvas(element);

      let pdf: jsPDF;
      let pdfWidth = 210;
      let pdfHeight = 297;

      if (paperSize === 'a4') {
        pdf = new jsPDF('portrait', 'mm', 'a4');
        pdfWidth = 210;
        pdfHeight = 297;
      } else if (paperSize === 'a5_portrait') {
        pdf = new jsPDF('portrait', 'mm', 'a5');
        pdfWidth = 148;
        pdfHeight = 210;
      } else {
        pdf = new jsPDF('landscape', 'mm', 'a5');
        pdfWidth = 210;
        pdfHeight = 148;
      }

      const margin = paperSize.startsWith('a5') ? 5 : 8;
      const printableWidth = pdfWidth - (margin * 2);
      const printableHeight = pdfHeight - (margin * 2);
      const totalRenderHeight = (canvas.height * printableWidth) / canvas.width;

      if (totalRenderHeight <= printableHeight * 1.12) {
        let finalWidth = printableWidth;
        let finalHeight = totalRenderHeight;
        let offsetX = margin;

        if (totalRenderHeight > printableHeight) {
          const fitScale = printableHeight / totalRenderHeight;
          finalWidth = printableWidth * fitScale;
          finalHeight = printableHeight;
          offsetX = margin + (printableWidth - finalWidth) / 2;
        }

        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', offsetX, margin, finalWidth, finalHeight);
      } else {
        const pxPerMm = canvas.width / printableWidth;
        const canvasPageHeight = Math.floor(printableHeight * pxPerMm);
        const totalPages = Math.ceil(canvas.height / canvasPageHeight);

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
          if (pageIdx > 0) {
            pdf.addPage(
              paperSize === 'a4' ? 'a4' : 'a5',
              paperSize === 'a5_landscape' ? 'landscape' : 'portrait'
            );
          }

          const sourceY = pageIdx * canvasPageHeight;
          const sliceHeight = Math.min(canvasPageHeight, canvas.height - sourceY);

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;

          const pageCtx = pageCanvas.getContext('2d');
          if (pageCtx) {
            pageCtx.fillStyle = '#ffffff';
            pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            pageCtx.drawImage(
              canvas,
              0,
              sourceY,
              canvas.width,
              sliceHeight,
              0,
              0,
              canvas.width,
              sliceHeight
            );

            const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
            const pageRenderHeight = (sliceHeight * printableWidth) / canvas.width;
            pdf.addImage(pageImgData, 'PNG', margin, margin, printableWidth, pageRenderHeight);
          }
        }
      }

      const sanitizedClient = (invoice.clientName || 'مشتری').replace(/[/\\?%*:|"<>]/g, '-').trim();
      const filename = `Invoice_${invoice.invoiceNumber || 'factor'}_${sanitizedClient}.pdf`;

      try {
        pdf.save(filename);
      } catch {
        const blob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      }

      setFeedbackMsg({
        type: 'success',
        text: `فایل PDF سند #${invoice.invoiceNumber} آماده و دانلود شد.`
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      try {
        handlePrint();
      } catch {
        setFeedbackMsg({
          type: 'error',
          text: 'خطا در ایجاد و دانلود فایل PDF فاکتور.'
        });
      }
      setTimeout(() => setFeedbackMsg(null), 5000);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    setIsDownloadingImage(true);
    setFeedbackMsg(null);
    try {
      const element = printRef.current;
      const canvas = await captureFullInvoiceCanvas(element);

      const imgData = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      const sanitizedClient = (invoice.clientName || 'مشتری').replace(/[/\\?%*:|"<>]/g, '-').trim();
      link.download = `Invoice_${invoice.invoiceNumber || 'factor'}_${sanitizedClient}.png`;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 500);

      setFeedbackMsg({
        type: 'success',
        text: `تصویر کامل فاکتور (PNG) دانلود شد.`
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error('Error downloading image:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'خطا در دانلود تصویر فاکتور.'
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const getInvoiceTypeTitle = (type: Invoice['type']) => {
    if (design.headerTitle && design.headerTitle.trim()) {
      return design.headerTitle;
    }
    switch (type) {
      case 'purchase':
        return 'فاکتور خرید کالا و خدمات';
      case 'proforma_sale':
      case 'proforma':
        return 'پیش‌فاکتور';
      case 'proforma_purchase':
        return 'پیش‌فاکتور خرید کالا و خدمات';
      case 'sale_return':
        return 'صورت‌حساب برگشت از فروش و اصلاحی';
      case 'purchase_return':
        return 'صورت‌حساب برگشت از خرید و مرجوعی';
      case 'service':
        return 'فاکتور خدمات مهندسی';
      case 'sale':
      default:
        return 'فاکتور فروش کالا و خدمات';
    }
  };

  const isPurchaseType = invoice.type === 'purchase' || invoice.type === 'purchase_return' || invoice.type === 'proforma_purchase';
  const isProforma = invoice.type === 'proforma_sale' || invoice.type === 'proforma_purchase' || invoice.type === 'proforma';

  const fontClass =
    design.fontFamily === 'iranyekan' ? 'font-sans' :
    design.fontFamily === 'serif' ? 'font-serif' :
    design.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

  const primaryHex = design.primaryColor || '#1e40af';
  const isA5Portrait = paperSize === 'a5_portrait';
  const isA5Landscape = paperSize === 'a5_landscape';
  const isCompact = isA5Portrait || isA5Landscape;
  const containerMaxWidth = isA5Portrait ? 'max-w-xl' : 'max-w-4xl';

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isInline || previewZoom <= 1 || event.button !== 0 || !previewViewportRef.current) return;
    event.preventDefault();
    previewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPreviewDragging(true);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current;
    const viewport = previewViewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport) return;

    const maxX = Math.max(0, (previewSheetSize.width * previewScale * previewZoom - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (previewSheetSize.height * previewScale * previewZoom - viewport.clientHeight) / 2);
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    setPreviewOffset({
      x: Math.max(-maxX, Math.min(maxX, nextX)),
      y: Math.max(-maxY, Math.min(maxY, nextY))
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (previewDragRef.current?.pointerId !== event.pointerId) return;
    previewDragRef.current = null;
    setIsPreviewDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    if (isInline) return;

    const viewport = previewViewportRef.current;
    const sheet = previewSheetRef.current;
    if (!viewport || !sheet) return;

    const updatePreviewScale = () => {
      const sheetWidth = sheet.offsetWidth;
      const sheetHeight = sheet.offsetHeight;
      const availableWidth = Math.max(0, viewport.clientWidth - 24);
      const availableHeight = Math.max(0, viewport.clientHeight - 24);
      if (!sheetWidth || !sheetHeight || !availableWidth || !availableHeight) return;

      setPreviewSheetSize({ width: sheetWidth, height: sheetHeight });
      setPreviewScale(Math.min(1, availableWidth / sheetWidth, availableHeight / sheetHeight));
    };

    const observer = new ResizeObserver(updatePreviewScale);
    observer.observe(viewport);
    observer.observe(sheet);
    updatePreviewScale();

    return () => observer.disconnect();
  }, [isInline, invoice, paperSize, design.showLogo, design.showStamp, design.showSignature, resolvedNotes, resolvedTerms]);

  useEffect(() => {
    if (previewZoom <= 1) {
      previewDragRef.current = null;
      setIsPreviewDragging(false);
      setPreviewOffset({ x: 0, y: 0 });
      return;
    }

    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const maxX = Math.max(0, (previewSheetSize.width * previewScale * previewZoom - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (previewSheetSize.height * previewScale * previewZoom - viewport.clientHeight) / 2);
    setPreviewOffset(current => ({
      x: Math.max(-maxX, Math.min(maxX, current.x)),
      y: Math.max(-maxY, Math.min(maxY, current.y))
    }));
  }, [isInline, previewZoom, previewScale, previewSheetSize]);

  const paperContent = (
    <div
      ref={printRef}
      id="printable-invoice"
      className={`paper-${paperSize} ${isCompact ? 'p-4 sm:p-6 text-xs' : 'p-6 sm:p-10 md:p-12 text-slate-900'} bg-white ${fontClass} relative select-text`}
      style={{ minHeight: isA5Portrait ? '480px' : isA5Landscape ? '380px' : '650px' }}
    >
      {design.showWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04] overflow-hidden">
          <span className="text-8xl md:text-9xl font-black rotate-[-25deg] uppercase tracking-widest text-slate-900 select-none">
            {isProforma ? 'PROFORMA' : (invoice.status === 'paid' ? 'PAID' : 'HABINO')}
          </span>
        </div>
      )}

      {isProforma && (
        <div className="mb-4 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-center text-xs font-bold text-indigo-900">
          پیش‌فاکتور برآورد قیمت (فاقد بار مالیاتی و اسنادی تا پیش از تایید و صدور فاکتور نهایی)
        </div>
      )}

      <div className={`space-y-6 p-6 md:p-8 bg-white ${templatePresentation[activeTemplate].frame}`}>
          <div className={`flex items-center justify-between border px-4 py-2.5 text-[10px] font-bold tracking-wide ${presentation.ribbon}`}>
            <span>نرم افزار حسابداری ابری هابینو</span>
            <span>{isProforma ? 'پیش‌فاکتور' : invoice.status === 'paid' ? 'تسویه‌شده' : 'سند مالی'}</span>
          </div>
          <div className="flex justify-between items-start border-b pb-6" style={{ borderColor: primaryHex }}>
            <div className="flex items-start gap-4">
              {design.showLogo && (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xs shrink-0"
                  style={{ backgroundColor: primaryHex }}
                >
                  {settings.name.charAt(0) || 'هـ'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-black text-slate-900">{settings.name}</h1>
                {settings.legalName && <p className="text-xs text-slate-600 font-semibold">{settings.legalName}</p>}
                <p className="text-xs text-slate-500 mt-1">{settings.address}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>تلفن: {toPersianDigits(settings.phone)}</span>
                  {settings.economicCode && <span>کد اقتصادی: {toPersianDigits(settings.economicCode)}</span>}
                </div>
              </div>
            </div>

            <div className="text-left">
              <span className="text-lg md:text-xl font-bold block" style={{ color: primaryHex }}>
                {getInvoiceTypeTitle(invoice.type)}
              </span>
              <div className="text-xs text-slate-600 mt-2 space-y-1">
                <p>شماره سند: <span className="font-mono font-bold text-slate-900">#{invoice.invoiceNumber}</span></p>
                <p>تاریخ صدور: <span className="font-semibold text-slate-800">{toPersianDigits(invoice.date)}</span></p>
                <p>ساعت ثبت: <span className="font-semibold text-slate-800">{formatDocumentTime(invoice.created_at)}</span></p>
                {invoice.dueDate && (
                  <p>تاریخ سررسید: <span className="font-semibold text-slate-800">{toPersianDigits(invoice.dueDate)}</span></p>
                )}
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-4 p-4 text-xs border ${presentation.partyCard}`}>
            {isPurchaseType ? (
              <>
                <div className="border-l border-slate-200 pl-4">
                  <span className="font-bold block mb-1" style={{ color: primaryHex }}>
                    مشخصات فروشنده / تأمین‌کننده:
                  </span>
                  <p className="font-bold text-slate-900 text-sm">{invoice.clientName}</p>
                  {client?.companyName && <p className="text-slate-600">شرکت: {client.companyName}</p>}
                  {client?.phone && <p className="text-slate-500">شماره تماس: {toPersianDigits(client.phone)}</p>}
                  {client?.address && <p className="text-slate-500">نشانی: {client.address}</p>}
                </div>
                <div>
                  <span className="font-bold text-slate-700 block mb-1">مشخصات خریدار (ما):</span>
                  <p className="text-slate-900 font-bold text-sm">{settings.name}</p>
                  <p className="text-slate-500">نشانی: {settings.address}</p>
                  <p className="text-slate-500">تلفن: {toPersianDigits(settings.phone)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="border-l border-slate-200 pl-4">
                  <span className="font-bold text-slate-700 block mb-1">مشخصات فروشنده (ما):</span>
                  <p className="text-slate-900 font-bold text-sm">{settings.name}</p>
                  <p className="text-slate-500">نشانی: {settings.address}</p>
                  <p className="text-slate-500">تلفن: {toPersianDigits(settings.phone)}</p>
                </div>
                <div>
                  <span className="font-bold block mb-1" style={{ color: primaryHex }}>
                    مشخصات خریدار / کارفرما:
                  </span>
                  <p className="font-bold text-slate-900 text-sm">{invoice.clientName}</p>
                  {client?.companyName && <p className="text-slate-600">شرکت: {client.companyName}</p>}
                  {client?.phone && <p className="text-slate-500">شماره تماس: {toPersianDigits(client.phone)}</p>}
                  {client?.address && <p className="text-slate-500">نشانی: {client.address}</p>}
                </div>
              </>
            )}
          </div>

          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className={`${presentation.tableHeader} border-b font-bold`}>
                <th className="p-3 w-12 text-center">ردیف</th>
                <th className="p-3">شرح کالا یا خدمات</th>
                <th className="p-3 text-center w-16">تعداد</th>
                <th className="p-3 text-left w-28">مبلغ واحد</th>
                {design.showDiscountColumn && <th className="p-3 text-left w-24">تخفیف</th>}
                {design.showTaxColumn && <th className="p-3 text-left w-20">مالیات</th>}
                <th className="p-3 text-left w-32">مبلغ کل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((it, idx) => (
                <tr key={it.id} className="hover:bg-slate-50/50">
                  <td className="p-3 text-center font-mono text-slate-500">{toPersianDigits(idx + 1)}</td>
                  <td className="p-3 font-medium text-slate-800">{it.description}</td>
                  <td className="p-3 text-center font-mono">{toPersianDigits(it.quantity)}</td>
                  <td className="p-3 text-left font-mono">{formatCurrency(it.unitPrice, settings.currency)}</td>
                  {design.showDiscountColumn && (
                    <td className="p-3 text-left font-mono text-slate-400">
                      {formatCurrency(it.discount, settings.currency)}
                    </td>
                  )}
                  {design.showTaxColumn && (
                    <td className="p-3 text-left font-mono text-slate-500">
                      %{toPersianDigits(it.taxRate)}
                    </td>
                  )}
                  <td className="p-3 text-left font-mono font-bold text-slate-900">
                    {formatCurrency(calculateItemTotal(it, design.showTaxColumn), settings.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-end pt-4 border-t border-slate-100">
            <div className="w-1/2 space-y-3">
              {resolvedNotes && (
                <div className="text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700">
                  <span className="font-bold block mb-1 text-slate-900">{design.notesTitle}</span>
                  <p className="whitespace-pre-line leading-relaxed">{resolvedNotes}</p>
                </div>
              )}
            </div>

            <div className={`w-80 space-y-2 text-xs p-4 border ${presentation.totalsCard}`}>
              <div className="flex justify-between text-slate-600">
                <span>جمع کل اقلام:</span>
                <span className="font-mono font-medium">{formatCurrency(invoice.subtotal, settings.currency)}</span>
              </div>
              {invoice.totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>تخفیف کل:</span>
                  <span className="font-mono font-medium">{formatCurrency(invoice.totalDiscount, settings.currency)}</span>
                </div>
              )}
              {design.showTaxColumn && invoice.totalTax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>مالیات بر ارزش افزوده:</span>
                  <span className="font-mono font-medium">{formatCurrency(invoice.totalTax, settings.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2 border-slate-200" style={{ color: primaryHex }}>
                <span>{isProforma ? 'جمع مبلغ پیش‌فاکتور:' : 'مبلغ نهایی فاکتور:'}</span>
                <span className="font-mono">{formatCurrency(resolvedGrandTotal, settings.currency)}</span>
              </div>
              {design.showPreviousBalance && !isProforma && (
                <div className="space-y-1.5 border-t border-slate-200 pt-2">
                  <div className="flex justify-between text-slate-600">
                    <span>مانده حساب از قبل:</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(Math.abs(resolvedPreviousBalance), settings.currency)} {getBalanceStatusText(resolvedPreviousBalance)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>جمع کل بدهی طرف‌حساب:</span>
                    <span className="font-mono">
                      {formatCurrency(Math.abs(resolvedTotalDebt), settings.currency)} {getBalanceStatusText(resolvedTotalDebt)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(design.showSignature || design.showStamp) && (
            <div className="flex justify-between items-center pt-8 border-t border-slate-200 mt-6">
              {design.showSignature && (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700 mb-2">{design.signatureSignerTitle}</p>
                  {invoice.signatureUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={invoice.signatureUrl}
                        alt="Signature"
                        className="max-h-20 object-contain mx-auto"
                      />
                      <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center justify-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>تایید شده و امضا گردید</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-16 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl px-4">
                      (فاقد امضا)
                    </div>
                  )}
                </div>
              )}

              {design.showStamp && (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700 mb-2">مهر شرکت / واحد مالی</p>
                  {settings.stampUrl ? (
                    <img src={settings.stampUrl} alt="Stamp" className="max-h-20 object-contain mx-auto opacity-90" />
                  ) : (
                    <div className="h-16 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl px-4">
                      (محل مهر)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );

  return (
    <>
    <div className={isInline ? "w-full" : `fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center overflow-hidden ${isPreviewMaximized ? 'p-0' : 'p-2 sm:p-4'}`}>
      <div className={`bg-white shadow-2xl border border-slate-200 w-full ${isPreviewMaximized ? 'max-w-none rounded-none' : `${containerMaxWidth} rounded-3xl`} overflow-hidden flex flex-col min-h-0 ${
        isInline ? 'h-auto max-h-none' : isPreviewMaximized ? 'h-[100dvh] max-h-none' : 'h-[96dvh] max-h-[96dvh]'
      }`} dir="rtl">
        {/* Top Control Bar */}
        {!isInline && (
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold">
                هـ
              </div>
              <div>
                <h3 className="text-sm font-bold">پیش‌نمایش و مدیریت سند #{invoice.invoiceNumber}</h3>
                <p className="text-xs text-slate-400">سیستم حسابداری هابینو</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewMaximized(true)}
                disabled={isPreviewMaximized}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                title="نمایش پیش‌نمایش در تمام صفحه"
                aria-label="نمایش پیش‌نمایش در تمام صفحه"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewMaximized(false)}
                disabled={!isPreviewMaximized}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                title="کوچک‌کردن پیش‌نمایش"
                aria-label="کوچک‌کردن پیش‌نمایش"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowSignatureCanvas(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{invoice.isSigned ? 'ویرایش امضای فیزیکی' : 'امضای فیزیکی سند'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>اشتراک‌گذاری</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer"
                title="چاپ سند"
              >
                <Printer className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="دانلود PDF"
              >
                {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {!isInline && (
          <div className="shrink-0 px-3 py-2 bg-slate-800 border-t border-slate-700 flex items-center justify-center gap-3 text-white no-print">
            <button
              type="button"
              onClick={() => setPreviewZoom(value => Math.max(0.5, Math.round((value - 0.1) * 100) / 100))}
              disabled={previewZoom <= 0.5}
              className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="کوچک‌نمایی"
              aria-label="کوچک‌نمایی"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={previewZoom}
              onChange={event => setPreviewZoom(Number(event.target.value))}
              className="w-36 sm:w-56 accent-blue-400 cursor-pointer"
              dir="ltr"
              aria-label="بزرگنمایی پیش‌نمایش فاکتور"
              aria-valuetext={`${Math.round(previewZoom * 100)} درصد`}
            />
            <span className="w-12 text-center text-xs font-mono" aria-live="polite">
              {toPersianDigits(`${Math.round(previewZoom * 100)}٪`)}
            </span>
            <button
              type="button"
              onClick={() => setPreviewZoom(value => Math.min(2, Math.round((value + 0.1) * 100) / 100))}
              disabled={previewZoom >= 2}
              className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="بزرگ‌نمایی"
              aria-label="بزرگ‌نمایی"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewZoom(1);
                setPreviewOffset({ x: 0, y: 0 });
              }}
              className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-[10px] font-semibold"
              title="بازگشت به نمای کامل"
            >
              نمای کامل
              <RotateCcw className="w-3 h-3 inline-block mr-1" />
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className={`p-3 text-xs font-bold flex items-center gap-2 no-print ${feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-rose-50 text-rose-800 border-b border-rose-200'}`}>
            {feedbackMsg.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Paper Container */}
        <div
          ref={isInline ? undefined : previewViewportRef}
          className={`flex-1 min-h-0 bg-slate-100 printable-invoice-container ${
            isInline ? 'overflow-visible p-4 sm:p-6' : 'overflow-hidden p-2 sm:p-3 flex items-center justify-center'
          } ${!isInline && previewZoom > 1 ? (isPreviewDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerUp}
          onPointerCancel={handlePreviewPointerUp}
          style={!isInline && previewZoom > 1 ? { touchAction: 'none' } : undefined}
        >
          <div
            className="relative mx-auto shrink-0"
            style={!isInline && previewSheetSize.width ? {
              width: previewSheetSize.width * previewScale * previewZoom,
              height: previewSheetSize.height * previewScale * previewZoom,
              transform: `translate(${previewOffset.x}px, ${previewOffset.y}px)`
            } : undefined}
          >
            <div
              ref={isInline ? undefined : previewSheetRef}
              className="max-w-3xl mx-auto shadow-lg rounded-2xl overflow-hidden bg-white"
              style={!isInline && previewSheetSize.width ? {
                position: 'absolute',
                top: 0,
                left: '50%',
                width: previewSheetSize.width,
                transform: `translateX(-50%) scale(${previewScale * previewZoom})`,
                transformOrigin: 'top center'
              } : undefined}
            >
              {!isPrintPortalReady && paperContent}
            </div>
          </div>
        </div>
      </div>

    </div>
    {!isInline && isPrintPortalReady && createPortal(
      <div id="habino-invoice-print-portal" dir="rtl">
        <div className="printable-invoice-container">
          {paperContent}
        </div>
      </div>,
      document.body
    )}

      {/* Signature Pad Modal */}
      {showSignatureCanvas && (
        <PhysicalSignatureCanvas
          invoiceNumber={invoice.invoiceNumber}
          defaultSignerName={invoice.clientName}
          onSave={handleSaveSignature}
          onCancel={() => setShowSignatureCanvas(false)}
          isSubmitting={isSavingSignature}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareInvoiceModal
          invoice={invoice}
          settings={settings}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
};