// src/pages/QuotationView.tsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import WonLostDecision from "../components/WonLostDecision";
import VersionHistory from "../components/VersionHistory";
import VersionViewer from "../components/VersionViewer";
import ValidityBanner from "../components/ValidityBanner";
import ReIssueModal from "../components/quotations/ReIssueModal";
import { formatDateDDMMYYYY } from "../utils/date";

/**
 * QuotationView.tsx (rewritten)
 *
 * Key improvements:
 * - Robust normalization for many backend shapes.
 * - Safer PDF fetch/open with Accept: application/pdf and debug preview if HTML returned.
 * - Logs resp.url and resp.status for easier debugging.
 * - Small UI components (toast / confirm / error) kept local and simple.
 * - Defensive code and clear error messages.
 */

/* ---------- API_BASE resolution (supports Vite env or window __ENV or fallback) ---------- */
// @ts-ignore unused function
const _API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (window as any).__ENV?.API_BASE ||
  window.location.origin;

/* ---------- types ---------- */
type RawItem = any;
type Item = {
  product_id: number;
  product_name: string;
  description?: string;
  qty: number;
  uom?: string;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
};

type Quotation = {
  id: number;
  quotation_no: string;
  quotation_date?: string | null;
  created_at?: string | null;
  enquiry_date?: string | null;
  payment_terms?: string | null;
  validity_days?: number;
  valid_until?: string | null;
  remaining_days?: number | null;
  validity_state?: "valid" | "due" | "overdue" | "expired";
  version?: string | null;
  customer_id?: number | null;
  customer_name?: string;
  customer_contact_person?: string | null;
  customer_address?: string | null;
  customer_gst?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  salesperson_id?: number | null;
  salesperson_name?: string | null;
  salesperson_phone?: string | null;
  salesperson_email?: string | null;
  items?: any;
  total_value?: number | null;
  next_followup_date?: string | null;
  terms?: string | null;
  notes?: string | null;
  status?: string;
  approved_by?: string | null;
  approved_at?: string | null;
};

/* ---------- UI HELPERS ---------- */
function SmallToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="fixed right-6 bottom-6 z-50">
      <div className="bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg">{message}</div>
    </div>
  );
}

const FOLLOWUP_TYPE_META = {
  call: { label: "CALL", color: "bg-blue-100 text-blue-700" },
  email: { label: "EMAIL", color: "bg-indigo-100 text-indigo-700" },
  whatsapp: { label: "WHATSAPP", color: "bg-green-100 text-green-700" },
  meeting: { label: "MEETING", color: "bg-purple-100 text-purple-700" },
  site_visit: { label: "SITE VISIT", color: "bg-amber-100 text-amber-700" },
  other: { label: "OTHER", color: "bg-gray-100 text-gray-700" },
} as const;


function getNextFollowupMeta(
  nextDate?: string | null,
  type?: keyof typeof FOLLOWUP_TYPE_META
) {
  if (!nextDate) return null;

  const d = new Date(nextDate);
  if (isNaN(d.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);

  const diff =
    Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let tone =
    diff < 0
      ? "bg-red-100 text-red-700"
      : diff === 0
        ? "bg-amber-100 text-amber-700"
        : "bg-green-100 text-green-700";

  const label =
    diff < 0
      ? `Overdue (${Math.abs(diff)}d)`
      : diff === 0
        ? "Today"
        : diff === 1
          ? "Tomorrow"
          : `In ${diff} days`;


  const meta =
    FOLLOWUP_TYPE_META[type || "other"] || FOLLOWUP_TYPE_META.other;

  return {
    date: d,
    label: `${meta.label} · ${label}`,
    color: tone,
  };
}




function ConfirmModal({
  title,
  message,
  open,
  loading,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  open: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-2">{title ?? "Confirm"}</h3>
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 border rounded-lg" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-green-600 text-white" onClick={onConfirm} disabled={loading}>
            {loading ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorModal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title?: string;
  message?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold">{title ?? "Error"}</h3>
          <button className="text-gray-500" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{message ?? "An unknown error occurred."}</div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded border text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- SVG ICONS HELPERS  ---------- */

function IconEdit({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconPrint({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18h12v4H6z" />
      <path d="M6 14H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2" />
    </svg>
  );
}

function IconCopy({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconMail({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

/* ---------- helpers for PDF / blob detection ---------- */
// @ts-ignore unused function
function _extractFilenameFromContentDisposition(header?: string | null): string | null {
  if (!header) return null;
  const filenameStar = /filename\*\s*=\s*(?:UTF-8'')?([^;,\n]+)/i.exec(header);
  if (filenameStar && filenameStar[1]) {
    try {
      return decodeURIComponent(filenameStar[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return filenameStar[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  const m = /filename\s*=\s*["']?([^"';,]+)["']?/i.exec(header);
  if (m && m[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return null;
}

async function blobIsPdf(blob: Blob) {
  try {
    const header = await blob.slice(0, 8).text();
    return header.startsWith("%PDF-");
  } catch {
    return false;
  }
}



// @ts-ignore unused function
async function _blobLooksLikeHtml(blob: Blob) {
  try {
    if (await blobIsPdf(blob)) return false;
    const preview = await blob.slice(0, 512).text();
    return /<html|<!doctype html|<body|<script/i.test(preview);
  } catch {
    return false;
  }
}

// @ts-ignore unused function
async function _fetchWithRetries(input: RequestInfo, init?: RequestInit, attempts = 2) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(input, init);
      return r;
    } catch (e) {
      lastErr = e;
      // backoff
      await new Promise((res) => setTimeout(res, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

/* ---------- main component ---------- */
export default function QuotationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<Quotation | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);


  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [_decision, setDecision] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<string | null>(null);  // ✅ NEW: Track which version user is viewing
  const { } = useAuth();
  const [_actionsMenuOpen, _setActionsMenuOpen] = useState(false);

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const [showReIssue, setShowReIssue] = useState(false);

  const [activeTab, setActiveTab] =
    useState<"overview" | "products" | "followups" | "history">("overview");






  const [showAddFollowup, setShowAddFollowup] = useState(false);
  const [followups, setFollowups] = useState<any[]>([]);
  const [loadingFollowups, setLoadingFollowups] = useState(false);




  const slaCounters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let missed = 0;
    let todayCnt = 0;
    let upcoming = 0;

    for (const f of followups) {
      if (!f.next_followup_date || f.is_completed) continue;

      const d = new Date(f.next_followup_date);
      d.setHours(0, 0, 0, 0);

      if (d < today) missed++;
      else if (d.getTime() === today.getTime()) todayCnt++;
      else upcoming++;
    }

    return { missed, today: todayCnt, upcoming };
  }, [followups]);


  const markFollowupDone = async (followupId: number) => {
    if (!quote?.id) return;

    try {
      await api.completeQuotationFollowup(followupId);

      const refreshed = await api.getQuotationFollowups(quote.id);
      setFollowups(
        Array.isArray(refreshed)
          ? refreshed.map(f => ({
            ...f,
            is_completed: Boolean(f.is_completed),
          }))
          : []
      );
      setToast("Follow-up marked as completed");
    } catch (e) {
      console.error(e);
      setToast("Failed to mark follow-up");
    }
  };


  const nextPlannedFollowup = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const planned = followups
      .filter(f => f.next_followup_date)
      .map(f => ({
        ...f,
        d: new Date(f.next_followup_date),
      }))
      .filter(f => !isNaN(f.d.getTime()))
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    if (!planned.length) return null;

    const f = planned[0];

    const diffDays = Math.round(
      (f.d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    const tone =
      diffDays < 0
        ? "bg-red-100 text-red-700"
        : diffDays === 0
          ? "bg-amber-100 text-amber-700"
          : "bg-green-100 text-green-700";

    return {
      ...f,
      diffDays,
      tone,
    };
  }, [followups]);

  const lastInteraction = useMemo(() => {
    if (!followups.length) return null;

    return [...followups]
      .sort(
        (a, b) =>
          new Date(b.followup_date).getTime() -
          new Date(a.followup_date).getTime()
      )[0];
  }, [followups]);

  const followupRiskScore = useMemo(() => {
    const remaining = quote?.remaining_days ?? null;

    // 🔴 Expired quotation always wins
    if (quote?.validity_state === "expired") {
      return { level: "critical", label: "Expired", color: "red" };
    }

    // 🟠 Time-critical validity
    if (typeof remaining === "number" && remaining <= 0) {
      return { level: "warning", label: "Time-Critical", color: "amber" };
    }

    // Get OPEN follow-ups only
    const openFollowups = followups.filter(f => !f.is_completed);

    // ✅ All follow-ups completed → Healthy
    if (openFollowups.length === 0 && followups.length > 0) {
      return { level: "healthy", label: "All Follow-Ups Completed", color: "green" };
    }

    // 🔴 Missed follow-up
    if (nextPlannedFollowup && nextPlannedFollowup.diffDays < 0) {
      return { level: "critical", label: "Missed Follow-Up", color: "red" };
    }

    // 🟡 No follow-up yet
    if (followups.length === 0) {
      return { level: "warning", label: "No Follow-Up Yet", color: "amber" };
    }

    // 🟡 Stale follow-up (calculated correctly)
    if (lastInteraction) {
      const lastDate = new Date(lastInteraction.followup_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      lastDate.setHours(0, 0, 0, 0);

      const daysAgo =
        Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysAgo >= 3 && typeof remaining === "number" && remaining <= 3) {
        return { level: "warning", label: "Stale Follow-Up", color: "amber" };
      }
    }

    // 🟢 Healthy
    return { level: "healthy", label: "On Track", color: "green" };
  }, [
    quote?.validity_state,
    quote?.remaining_days,
    followups,
    lastInteraction,
    nextPlannedFollowup,
  ]);




  // ---------- follow-up status helper ---------- //



  //---------- high-risk quotation helper ---------- //





  /* ---------- item normalizer ---------- */
  const normalizeItemsFromRaw = useCallback((rawInput: any): Item[] => {
    let raw = rawInput ?? [];
    if (raw == null) raw = [];
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) raw = [];

    return raw.map((it: RawItem) => {
      const qty = Number(it.qty ?? it.quantity ?? 0) || 0;
      const unit_price = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0) || 0;
      const tax_rate = Number(it.tax_rate ?? it.taxRate ?? 0) || 0;
      const discount_percent = Number(it.discount_percent ?? it.discountPercent ?? 0) || 0;
      return {
        product_id: Number(it.product_id ?? it.productId ?? 0) || 0,
        product_name: (it.product_name ?? it.productName ?? it.description ?? "") + "",
        description: it.description ?? it.product_name ?? "",
        qty,
        uom: it.uom ?? "NOS",
        unit_price,
        tax_rate,
        discount_percent,
      } as Item;
    });
  }, []);

  useEffect(() => {
    if (!quote?.id) return;

    setLoadingFollowups(true);

    api
      .getQuotationFollowups(quote.id)
      .then((data) =>
        setFollowups(
          Array.isArray(data)
            ? data.map(f => ({
              ...f,
              is_completed: Boolean(f.is_completed),
            }))
            : []
        )
      )
      .finally(() => setLoadingFollowups(false));
  }, [quote?.id]);


  /* ---------- row expander ---------- */
  function toggleRow(idx: number) {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  /* ---------- address helper ---------- */
  function formatAddressFromCustomer(customer: any): string {
    if (!customer) return "";
    if (typeof customer === "string" && customer.trim()) return customer.trim();

    const parts: string[] = [];
    const push = (v?: any) => {
      if (v == null) return;
      const s = String(v).trim();
      if (s) parts.push(s);
    };

    push(customer.address_full ?? customer.full_address ?? customer.addressText ?? customer.address_line);
    push(customer.address || customer.address1 || customer.address_line1 || customer.addr);
    push(customer.address2 || customer.address_line2);
    const city = customer.city || customer.town || customer.district || customer.locality;
    push(city);
    const state = customer.state || customer.region;
    push(state);
    const pin = customer.pincode || customer.pin || customer.zip || customer.postal_code;
    push(pin);
    push(customer.country);

    if (parts.length === 0 && Array.isArray(customer.address_lines)) {
      for (const ln of customer.address_lines) push(ln);
    }

    if (parts.length === 0) {
      const guess: string[] = [];
      Object.keys(customer || {}).forEach((k) => {
        const v = customer[k];
        if (typeof v === "string" && v.length > 8 && /[0-9a-zA-Z]/.test(v)) {
          guess.push(v.trim());
        }
      });
      if (guess.length) return guess.join(", ");
    }

    return parts.join(", ");
  }

  /* ---------- fetch & normalize ---------- */
  const fetchQuotation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const resp: any = await api.getQuotation(Number(id));
      console.debug("[QuotationView] rawResp:", resp);

      const qRaw: any = resp && (resp.quotation ?? resp);
      const q: any = { ...(qRaw || {}) };

      const customerCandidates = [
        q.customer,
        q.customer_info,
        q.customer_details,
        q.billing,
        q.bill_to,
        q.client,
        q.client_info,
        q.customerObj,
        q.customer_id,
        q.customerId,
      ];

      const topLevelCustomers = resp?.customers || resp?.customer_list || resp?.customers_list || resp?.customerMap || resp?.customer || [];

      let customerObj: any = null;
      for (const c of customerCandidates) {
        if (c != null && (typeof c === "object" || typeof c === "string" || typeof c === "number")) {
          customerObj = c;
          break;
        }
      }

      if ((typeof customerObj === "number" || typeof customerObj === "string") && topLevelCustomers && Array.isArray(topLevelCustomers)) {
        const idStr = String(customerObj);
        const found = topLevelCustomers.find((x: any) => String(x?.id ?? x?._id ?? x?.customer_id ?? "") === idStr);
        if (found) customerObj = found;
      }

      if (!customerObj && resp) {
        const fallbackKeys = [resp.customer, resp.client, resp.customer_info, resp.customer_details, resp.billing, resp.bill_to];
        for (const f of fallbackKeys) {
          if (f != null && (typeof f === "object" || typeof f === "string")) {
            customerObj = f;
            break;
          }
        }
      }

      const candidatesAddress = [
        q.customer_address,
        q.address,
        q.customer_address_full,
        q.address_full,
        q.address_text,
        q.billing_address,
        q.shipping_address,
        q.customer?.address,
        q.customer?.address_lines,
      ];

      let normalized_customer_address = "";
      for (const c of candidatesAddress) {
        if (c && typeof c === "string" && String(c).trim()) {
          normalized_customer_address = String(c).trim();
          break;
        }
      }

      if (!normalized_customer_address) {
        normalized_customer_address = formatAddressFromCustomer(customerObj) || "";
      }

      if (!normalized_customer_address && Array.isArray(topLevelCustomers) && topLevelCustomers.length > 0) {
        for (const c of topLevelCustomers) {
          const t = formatAddressFromCustomer(c);
          if (t) {
            normalized_customer_address = t;
            break;
          }
        }
      }

      const normalized_enquiry_date =
        q.enquiry_date ??
        q.lead_date ??
        q.enquiry_created_at ??
        q.enquiry?.created_at ??
        null;
      const normalized_customer_contact_person =
        q.customer_contact_person ??
        q.contact_person ??
        q.customer?.contact_person ??
        customerObj?.contact_person ??
        customerObj?.contactPerson ??
        "";
      const normalized_customer_gst =
        q.customer_gst ?? q.gstin ?? q.tax_id ?? q.customer?.gstin ?? customerObj?.gstin ?? customerObj?.gst ?? "";

      const normalized_customer_phone =
        q.customer_phone ?? q.phone ?? q.contact_number ?? q.mobile ?? q.customer?.phone ?? customerObj?.phone ?? customerObj?.mobile ?? "";

      const normalized_customer_email = q.customer_email ?? q.email ?? q.customer?.email ?? customerObj?.email ?? "";

      const spCandidates = [q.salesperson, q.salesperson_info, q.created_by, q.user, q.owner, q.created_by_user];
      let sp: any = null;
      for (const s of spCandidates) {
        if (s) {
          sp = s;
          break;
        }
      }

      const normalized_payment_terms =
        q.payment_terms ??
        q.paymentTerms ??
        q.commercial_terms?.payment_terms ??
        null;

      const normalized_salesperson_name = q.salesperson_name ?? q.created_by_name ?? (sp && (sp.name || sp.full_name || sp.username)) ?? "";

      const normalized_salesperson_phone = q.salesperson_phone ?? (sp && (sp.mobile || sp.phone || sp.contact)) ?? "";

      const normalized_salesperson_email = q.salesperson_email ?? (sp && (sp.email || sp.contact_email)) ?? "";

      const validity =
        q.validity && typeof q.validity === "object"
          ? q.validity
          : {};

      const normalizedQuote = {
        ...q,
        payment_terms: normalized_payment_terms,
        valid_until: validity.valid_until ?? q.valid_until ?? null,
        remaining_days: validity.remaining_days ?? q.remaining_days ?? null,
        validity_state: validity.validity_state ?? q.validity_state ?? "valid",

        enquiry_date: normalized_enquiry_date,
        customer_contact_person: normalized_customer_contact_person || "",
        customer_address: normalized_customer_address || "(Customer address not provided)",
        customer_gst: normalized_customer_gst || "",
        customer_phone: normalized_customer_phone || "",
        customer_email: normalized_customer_email || "",
        salesperson_name: normalized_salesperson_name || "",
        salesperson_phone: normalized_salesperson_phone || "",
        salesperson_email: normalized_salesperson_email || "",
      };

      console.debug("[QuotationView] normalizedQuote:", normalizedQuote);

      setQuote(normalizedQuote);
      setItems(
        normalizedQuote?.items ??
        normalizedQuote?.line_items ??
        normalizeItemsFromRaw(normalizedQuote?.items ?? normalizedQuote?.line_items ?? [])
      );

      // Fetch version history and decisions
      setHistoryLoading(true);
      try {
        const [versionsResp, decisionResp] = await Promise.all([
          api.getVersionHistory(Number(id)).catch(() => []),
          api.getQuotationDecisions(Number(id)).catch(() => null),
        ]);
        console.log('[QuotationView] Version history response:', { versionsResp, length: Array.isArray(versionsResp) ? versionsResp.length : 0 });
        setVersionHistory(Array.isArray(versionsResp) ? versionsResp : []);
        setDecision(decisionResp);
      } catch (err) {
        console.error("Failed to load version history:", err);
      } finally {
        setHistoryLoading(false);
      }
    } catch (err) {
      console.error("Failed to load quotation", err);
      setErrorMessage("Failed to load quotation. See console for details.");
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }, [id, normalizeItemsFromRaw]);

  useEffect(() => {
    fetchQuotation();
  }, [fetchQuotation]);

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    let grand = 0;
    const lines = items.map((it) => {
      const gross = (it.qty || 0) * (it.unit_price || 0);
      const discount = (gross * (it.discount_percent || 0)) / 100;
      const afterDiscount = gross - discount;
      const lineTax = (afterDiscount * (it.tax_rate || 0)) / 100;
      const lineTotal = afterDiscount + lineTax;
      subtotal += afterDiscount;
      tax += lineTax;
      grand += lineTotal;
      return { ...it, gross, discount, afterDiscount, lineTax, lineTotal };
    });
    return {
      lines,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      grand: Math.round(grand * 100) / 100,
    };
  }, [items]);

  const displayedGrand = useMemo(() => {
    if (quote && quote.total_value && Number(quote.total_value) > 0) return Number(quote.total_value);
    return totals.grand;
  }, [quote, totals.grand]);

  function fmt(n: number) {
    try {
      return "₹" + Number(n || 0).toLocaleString();
    } catch {
      return "₹" + String(n || 0);
    }
  }

  /* ---------- actions ---------- */
  // @ts-ignore unused function
  function _openConfirm(action: "approve" | "reject") {
    setConfirmAction(action);
    setConfirmOpen(true);
  }



  async function handleReIssue(opts: {
    mode: "same" | "edit";
    validityDays: number;
  }) {
    try {
      const res: any = await api.reissueQuotation(Number(id), {
        validity_days: opts.validityDays,
      });



      const newId = res?.id;

      setShowReIssue(false);

      if (opts.mode === "edit") {
        navigate(`/quotations/${newId}/edit`);
      } else {
        navigate(`/quotations/${newId}`);
      }
    } catch (e: any) {
      setToast(e?.error || "Failed to re-issue quotation");
    }
  }

  async function handleWon() {
    if (!id) return;
    setActionLoading(true);
    try {
      const res: any = await api.markQuotationWon(Number(id));
      const updated: Quotation = res && (res.quotation ?? res);
      setQuote(updated);
      if (updated.items) setItems(normalizeItemsFromRaw(updated.items));
      setToast("Quotation marked as Won");
      await fetchQuotation();
    } catch (err: any) {
      console.error("Error marking as won:", err);
      setErrorMessage(err?.message ?? "Failed to mark quotation as won");
      setErrorOpen(true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLost(reason: string) {
    if (!id) return;
    setActionLoading(true);
    try {
      const res: any = await api.markQuotationLost(Number(id), reason);
      const updated: Quotation = res && (res.quotation ?? res);
      setQuote(updated);
      if (updated.items) setItems(normalizeItemsFromRaw(updated.items));
      setToast("Quotation marked as Lost");
      await fetchQuotation();
    } catch (err: any) {
      console.error("Error marking as lost:", err);
      setErrorMessage(err?.message ?? "Failed to mark quotation as lost");
      setErrorOpen(true);
    } finally {
      setActionLoading(false);
    }
  }

  async function runConfirmAction() {
    if (!id || !confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction === "approve") {
        const res: any = await api.approveQuotation(Number(id));
        const updated: Quotation = res && (res.quotation ?? res);
        setQuote(updated);
        if (updated.items) setItems(normalizeItemsFromRaw(updated.items));
        setToast("Quotation approved");
      } else {
        if (typeof api.updateQuotation === "function") {
          await api.updateQuotation(Number(id), { status: "rejected" });
          await fetchQuotation();
          setToast("Quotation marked as rejected");
        } else {
          throw new Error("Reject not supported by API");
        }
      }
    } catch (err: any) {
      console.error("Action failed", err);
      setErrorMessage(err?.message ?? "Action failed");
      setErrorOpen(true);
    } finally {
      setActionLoading(false);
      setConfirmOpen(false);
      setConfirmAction(null);
    }
  }

  /* ---------- download PDF (safe) (Future planing) ---------- */


  /* ---------- open PDF in new tab (safe)   (Future planing ) ---------- */


  /* ---------- Helper for the words amount ---------- */

  function numberToWordsINR(amount: number) {
    const a = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
      "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const inWords = (num: number): string => {
      if (num < 20) return a[num];
      if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "");
      if (num < 1000)
        return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + inWords(num % 100) : "");
      if (num < 100000)
        return inWords(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + inWords(num % 1000) : "");
      if (num < 10000000)
        return inWords(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + inWords(num % 100000) : "");

      if (num < 100000000)
        return inWords(Math.floor(num / 10000000)) + " Crore" +
          (num % 10000000 ? " " + inWords(num % 10000000) : "");
      return ""
    };

    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);


    return `Rupees ${inWords(rupees)}${paise ? " and " + inWords(paise) + " Paise" : ""} Only`;
  }


  /* ---------- print (keeps your implementation) ---------- */
  async function printQuotation() {
    if (!quote) return;

    const esc = (v: any) =>
      String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const fmt = (n: number) =>
      "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

    const origin = window.location.origin;
    const logoUrl = `${origin}/logo.png`;

    const createdByName =
      quote.salesperson_name ||
      quote.approved_by ||
      "—";

    const createdByEmail =
      quote.salesperson_email ||
      "—";

    const createdByPhone =
      quote.salesperson_phone ||
      "—";


    /* ---------------- CALCULATIONS ---------------- */

    let subTotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const rowsHtml = items
      .map((it: any, i: number) => {
        const qty = Number(it.qty || 0);
        const rate = Number(it.unit_price || 0);
        const discountPct = Number(it.discount_percent || 0);
        const taxRate = Number(it.tax_rate || 0);

        const lineBase = qty * rate;
        const discount = (lineBase * discountPct) / 100;
        const taxable = lineBase - discount;
        const tax = (taxable * taxRate) / 100;


        subTotal += taxable;
        discountTotal += discount;
        taxTotal += tax;

        return `
        <tr>
          <td>${i + 1}</td>
          <td>
           <div class="item-product">${esc(it.product_name)}</div>
            <div class="item-description">${esc(it.description || "")}</div>
          </td>
          <td class="center">${qty}</td>
          <td class="right">${fmt(rate)}</td>
          <td class="right">${fmt(lineBase)}</td>
          
        </tr>`;
      })
      .join("");

    const grandTotal = subTotal + taxTotal;

    const termsHtml = quote.terms
      ? `<ol style="margin:0; padding-left:18px;">
      ${esc(quote.terms)
        .split(/\r?\n/)
        .filter(line => line.trim())
        .map(line =>
          `<li>${line.replace(/^\s*\d+[\.\)]\s*/, "")}</li>`
        )
        .join("")}
     </ol>`
      : "No terms and conditions provided.";

    const css = `
@page { size: A4; margin: 10mm; }

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5px;
  color: #000;
  line-height: 1.45; /* BIGGEST IMPROVEMENT */
}

.page {
  border: 1px solid #000;
  padding: 14px; /* more air inside page */
}

.bold { font-weight: bold; }
.right { text-align: right; }
.center { text-align: center; }

/* HEADER */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.logo { height: 55px; }

.title {
  font-size: 14px;
  font-weight: bold;
}

/* SEPARATORS */
hr {
  border: none;
  border-top: 1px solid #000;
  margin: 10px 0; /* more breathing space */
}

/* PARTY */
.party-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;           /* wider column spacing */
  margin-bottom: 6px;
}

.section-title {
  font-weight: bold;
  margin-bottom: 4px;
}

/* ITEMS TABLE (ONLY BOXED AREA) */

.item-product {
  font-family: "Segoe UI Symbol", "Segoe UI", Arial, sans-serif;
  font-weight: bold;
}

.item-description {
  font-family: "Segoe UI Symbol", "Segoe UI", Arial, sans-serif;
  font-weight: normal;
}


.items-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000;
  margin: 10px 0; /* space before & after table */
}

.items-table th,
.items-table td {
  border: 1px solid #000;
  padding: 6px 5px;   /* more readable rows */
  vertical-align: top;
}

.items-table th {
  background: #efefef;
  font-size: 10px;
}

/* SUMMARY */
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 10px;
  margin-bottom: 6px;
}

.summary-table td {
  padding: 4px 2px;
}

.summary-table tr + tr td {
  padding-top: 6px; /* row separation */
}

.summary-table .grand {
  font-weight: bold;
  font-size: 11.5px;
}

/* TERMS */
.terms {
  margin-top: 4px;
}

/* FOOTER */
.footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 10px;
}

`;



    /* ---------------- HTML ---------------- */


    const amountInWords = numberToWordsINR(grandTotal);
    const discountRow =
      discountTotal > 0
        ? `<tr><td>Discount</td><td class="right">− ${fmt(discountTotal)}</td></tr>`
        : "";


    const fmtDate = (d?: string | null) => {
      if (!d) return "—";

      // If already in DD-MM-YYYY, return as-is
      if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
        return d;
      }

      // If YYYY-MM-DD or ISO string
      const date = new Date(d);
      if (isNaN(date.getTime())) return "—";

      return date.toLocaleDateString("en-GB");
    };
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sales Quotation</title>
<style>${css}</style>
</head>

<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <img src="${logoUrl}" class="logo"/>
    <div class="right">
      <div class="title">Sales Quotation</div>
      <div class="bold">${quote.quotation_no}</div>
    </div>
  </div>

  <hr/>

  <!-- PARTY DETAILS -->
  <div class="party-grid">
    <div>
      <div class="section-title">Supplier Details</div>
      PRAYOSHA AUTOMATION PRIVATE LIMITED<br/>
      Vadodara, Gujarat<br/>
      GSTIN: 24AALCP3186E1ZD<br/>
      Prepared By: ${esc(createdByName)}<br/>
      Phone: ${esc(createdByPhone)}<br/>
      Email: ${esc(createdByEmail)}
    </div>

    <div>
  <div class="section-title">Buyer Details</div>

  <strong>${esc(quote.customer_name)}</strong><br/>

  ${quote.customer_contact_person
        ? `Contact Person: ${esc(quote.customer_contact_person)}<br/>`
        : ``}

  ${quote.customer_address
        ? `${esc(quote.customer_address)}<br/>`
        : ``}

  ${quote.customer_phone
        ? `Phone: ${esc(quote.customer_phone)}<br/>`
        : ``}

  ${quote.customer_email
        ? `Email: ${esc(quote.customer_email)}<br/>`
        : ``}

  ${quote.customer_gst
        ? `GSTIN: ${esc(quote.customer_gst)}`
        : ``}
</div>
  </div>

  <hr/>

  <!-- SQ DETAILS -->
  <div>
    <strong>SQ No:</strong> ${quote.quotation_no}<br/>
    <strong>SQ Date:</strong> ${fmtDate(quote.quotation_date)}<br/>
     <strong>Version:</strong> ${quote.version ?? "1.0"}<br/>
    <strong>Payment Terms:</strong> ${esc(quote.payment_terms || "—")}
  </div>

  <!-- ITEMS -->
  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th>Qty</th>
        <th>Rate</th>
        <th>Total</th>
        
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <!-- SUMMARY -->
  <div class="summary-grid">

  <!-- LEFT: AMOUNT IN WORDS -->
  <div>
    <strong>Amount in Words</strong><br/>
    ${amountInWords}
  </div>

  <!-- RIGHT: SUMMARY TABLE -->
  <table class="summary-table">
    <tr><td>Sub Total</td><td class="right">${fmt(subTotal)}</td></tr>
    ${discountRow}
    <tr><td>Tax</td><td class="right">${fmt(taxTotal)}</td></tr>
    <tr class="grand">
      <td>Grand Total</td>
      <td class="right">${fmt(grandTotal)}</td>
    </tr>
  </table>

</div>

  <hr/>

  <!-- TERMS -->
  <div class="terms">
    <strong>Terms & Conditions</strong>
    ${termsHtml}
  </div>

  <hr/>

  <!-- FOOTER -->
  <div class="footer-grid">
    <div>
      <strong>Bank Details</strong><br/>
      Bank: HDFC Bank Ltd<br/>
      A/C Name: PRAYOSHA AUTOMATION PRIVATE LIMITED<br/>
      A/C No: ___________<br/>
      IFSC: ___________
    </div>

    <div class="right">
      For PRAYOSHA AUTOMATION PRIVATE LIMITED<br/><br/>
      <strong>Authorised Signatory</strong>
    </div>
  </div>

</div>
</body>
</html>
`;


    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      // cleanup
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  }

  //-----------------Email operater --------------------///

  const copyLink = useCallback(() => {
    if (!quote?.id) return;

    const url = `${window.location.origin}/quotations/${quote.id}`;

    try {
      navigator.clipboard.writeText(url);
      setToast("Link copied");
    } catch (err) {
      console.error("Copy failed", err);
      setErrorMessage("Failed to copy link");
      setErrorOpen(true);
    }
  }, [quote]);




  ///Outlook option for the mail :-

  function openEmailClient(provider: "gmail" | "outlook") {
    if (!quote) return;

    const to = encodeURIComponent(quote.customer_email || "");
    const subject = encodeURIComponent(
      `Quotation ${quote.quotation_no || quote.id}`
    );

    const body = encodeURIComponent(
      `Hello,

Please find the quotation attached.
(Kindly attach the PDF before sending)

Quotation Link:
${window.location.origin}/quotations/${quote.id}

Ref: ${quote.quotation_no || quote.id}

Regards,`
    );

    let url = "";

    if (provider === "gmail") {
      url =
        `https://mail.google.com/mail/?view=cm&fs=1` +
        `&to=${to}` +
        `&su=${subject}` +
        `&body=${body}`;
    }

    if (provider === "outlook") {
      url =
        `https://outlook.office.com/mail/deeplink/compose` +
        `?to=${to}` +
        `&subject=${subject}` +
        `&body=${body}`;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    setToast(
      provider === "gmail"
        ? "Gmail compose opened"
        : "Outlook compose opened"
    );
  }



  /* ---------- render ---------- */
  if (loading) {
    return (
      <Layout>
        <div className="p-8 max-w-6xl mx-auto">Loading…</div>
      </Layout>
    );
  }
  if (!quote) {
    return (
      <Layout>
        <div className="p-8 max-w-6xl mx-auto">Quotation not found.</div>
      </Layout>
    );
  }

  const isApproved = (quote.status ?? "").toLowerCase() === "approved";
  const isRejected = (quote.status ?? "").toLowerCase() === "rejected";

  // header accent asset from public folder (use origin so it works when deployed)
  const headerAccent = `${window.location.origin}/header-accent.png`;

  function ItemsSummary({
    totals,
    displayedGrand,
    fmt,
    onViewProducts,
  }: {
    totals: any;
    displayedGrand: number;
    fmt: (n: number) => string;
    onViewProducts: () => void;
  }) {
    const [open, setOpen] = React.useState(false);



    return (
      <div className="border rounded-lg bg-white">
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-gray-50"
          onClick={() => setOpen(!open)}
        >
          <div>
            <h3 className="text-sm font-semibold">Items Detail</h3>
            <div className="text-xs text-gray-500">
              {totals.lines.length} items · Total {fmt(displayedGrand)}
            </div>
          </div>

          <span className="text-xs text-indigo-600">
            {open ? "Collapse ▲" : "Expand ▼"}
          </span>
        </div>

        {/* TABLE */}
        {open && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 w-12">#</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-center">Qty</th>
                  <th className="px-4 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-center">Disc</th>
                  <th className="px-4 py-2 text-center">Tax</th>
                  <th className="px-4 py-2 text-right">Line Total</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {totals.lines.map((l: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>

                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800 truncate">
                        {l.product_name}
                      </div>
                      {l.description && (
                        <div className="text-xs text-gray-500 truncate">
                          {l.description}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-2 text-center">{l.qty}</td>

                    <td className="px-4 py-2 text-right">
                      {fmt(l.unit_price)}
                    </td>

                    <td className="px-4 py-2 text-center">
                      {l.discount_percent > 0 ? (
                        <span className="text-rose-600 font-medium">
                          −{l.discount_percent}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2 text-center">
                      {l.tax_rate > 0 ? `${l.tax_rate}%` : "—"}
                    </td>

                    <td className="px-4 py-2 text-right font-medium">
                      {fmt(l.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex justify-between items-center px-4 py-3 border-t bg-gray-50">
          <div className="text-sm font-semibold">
            Total: {fmt(displayedGrand)}
          </div>

          <button
            onClick={onViewProducts}
            className="text-sm text-indigo-600 hover:underline"
          >
            View Full Products →
          </button>
        </div>
      </div>
    );
  }




  /// ---------- Add Follow-Up Modal ----------

  function AddFollowupModal({
    quotationId,
    onClose,
    onCreated,
  }: {
    quotationId: number;
    onClose: () => void;
    onCreated: () => void;
  }) {
    const [followupDate, setFollowupDate] = useState("");
    const [nextFollowupDate, setNextFollowupDate] = useState("");
    const [type, setType] = useState<
      "call" | "email" | "whatsapp" | "meeting" | "site_visit" | "other"
    >("call");
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const followupDateRef = useRef<HTMLInputElement>(null);
    const nextFollowupDateRef = useRef<HTMLInputElement>(null);

    async function submit() {
      if (!followupDate || !note.trim()) return;

      setLoading(true);
      try {
        await api.createQuotationFollowup(quotationId, {
          followup_date: followupDate,
          note: note.trim(),
          followup_type: type,
          next_followup_date: nextFollowupDate || null,
        });
        onCreated();
      } finally {
        setLoading(false);
      }
    }

    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
          {/* HEADER */}
          <div className="px-5 py-4 border-b">
            <h3 className="text-base font-semibold">Log Follow-Up</h3>
            <p className="text-xs text-gray-500">
              Record customer interaction and plan next action
            </p>
          </div>

          {/* BODY */}
          <div className="p-5 space-y-4">
            {/* TYPE */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Follow-Up Type
              </label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as
                    | "call"
                    | "email"
                    | "whatsapp"
                    | "meeting"
                    | "site_visit"
                    | "other"
                  )
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="call">📞 Call</option>
                <option value="email">📧 Email</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="meeting">🤝 Meeting</option>
                <option value="site_visit">🏭 Site Visit</option>
                <option value="other">📌 Other</option>
              </select>
            </div>

            {/* FOLLOW-UP DATE */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Follow-Up Date
              </label>
              <div className="relative">
                <input
                  ref={followupDateRef}
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  onClick={() => followupDateRef.current?.showPicker()}
                  className="w-full border rounded-lg px-3 py-2 text-sm pr-10 cursor-pointer"
                />

                {/* Calendar Icon */}
                <button
                  type="button"
                  onClick={() => followupDateRef.current?.showPicker()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600"
                  tabIndex={-1}
                >
                  📅
                </button>
              </div>
            </div>

            {/* NOTE */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Outcome / Notes
              </label>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened? What is the next expectation?"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* NEXT FOLLOW-UP */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <label className="text-xs font-medium text-indigo-700 mb-1 block">
                Next Follow-Up (Optional)
              </label>
              <div className="relative">
                <input
                  ref={nextFollowupDateRef}
                  type="date"
                  value={nextFollowupDate}
                  onChange={(e) => setNextFollowupDate(e.target.value)}
                  onClick={() => nextFollowupDateRef.current?.showPicker()}
                  className="w-full border rounded-lg px-3 py-2 text-sm pr-10 cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => nextFollowupDateRef.current?.showPicker()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-500 hover:text-indigo-700"
                  tabIndex={-1}
                >
                  📅
                </button>
              </div>
              <p className="text-[11px] text-indigo-600 mt-1">
                This drives Follow-Up Intelligence & risk scoring
              </p>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-5 py-4 border-t flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading || !followupDate || !note.trim()}
              className="px-4 py-2 text-sm rounded bg-indigo-600 text-white disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save Follow-Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }


  function StatCard({
    label,
    value,
    tone = "gray",
  }: {
    label: string;
    value: string;
    tone?: "green" | "amber" | "red" | "blue" | "gray";
  }) {
    const map: any = {
      green: "bg-green-50 text-green-700",
      amber: "bg-amber-50 text-amber-700",
      red: "bg-red-50 text-red-700",
      blue: "bg-indigo-50 text-indigo-700",
      gray: "bg-gray-50 text-gray-700",
    };

    return (
      <div className={`rounded-lg p-4 border ${map[tone]}`}>
        <div className="text-xs uppercase tracking-wide">{label}</div>
        <div className="text-lg font-semibold mt-1">{value}</div>
      </div>
    );
  }




  return (
    <Layout>
      <style>{`
        .hero-accent {
          background-image:
            linear-gradient(90deg, rgba(255,255,255,0.96), rgba(255,255,255,0.84)),
            url('${headerAccent}');
          background-size: cover;
          background-position: right center;
          border-radius: 12px;
          border: 1px solid rgba(15,23,42,0.04);
        }
        .status-pill {
          display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px;
        }
        .items-head { background: linear-gradient(90deg,#0b1220,#0f172a); color: #fff; }
        .items-table tbody tr:hover { background: rgba(30,41,59,0.03); }
        .totals-value { font-size:1.125rem; font-weight:700; }
        .action-primary { background: linear-gradient(90deg,#2563eb,#1d4ed8); color:white; }
        .action-ghost { background: white; border:1px solid rgba(15,23,42,0.06); }
        @media (max-width: 1024px) {
          .hero-accent { background-position: center; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto p-8">
        <div className="hero-accent p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-500">Quotation</div>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{quote.quotation_no}</h1>
              <div className="status-pill px-3 py-1">
                <svg width="10" height="10" viewBox="0 0 8 8" className={`${isApproved ? "text-green-500" : isRejected ? "text-rose-500" : "text-amber-500"}`}>
                  <circle cx="4" cy="4" r="4" fill="currentColor" />
                </svg>
                <span className={`${isApproved ? "text-green-800" : isRejected ? "text-rose-800" : "text-amber-800"} text-sm font-medium`}>{quote.status ?? "—"}</span>
              </div>
            </div>

            <div className="mt-2 text-sm text-gray-600">
              <span className="mr-4">Customer: <strong>{quote.customer_name ?? "—"}</strong></span>
              <span>Created: {quote.created_at ? new Date(quote.created_at).toLocaleString() : (quote.quotation_date ?? "—")}</span>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              {quote.version ? <span className="mr-4">Version: <strong>{quote.version}</strong></span> : null}
            </div>
            {quote.valid_until && (
              <div className="text-xs text-gray-500">
                Valid until: <strong>{formatDateDDMMYYYY(quote.valid_until)}</strong>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">

            {quote.validity_state === "expired" && (
              <button
                onClick={() => setShowReIssue(true)}
                title="Re-issue quotation"
                className="px-3 py-2 rounded border bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-2"
              >
                🔁 Re-Issue
              </button>
            )}

            {/* EDIT */}
            <button
              onClick={() => {
                if (quote.validity_state === "expired") return;
                navigate(`/quotations/${quote.id}/edit`);
              }}
              title={
                quote.validity_state === "expired"
                  ? "Quotation expired. Re-issue required."
                  : "Edit quotation"
              }
              disabled={quote.validity_state === "expired"}
              className={`p-2 rounded border bg-white hover:bg-gray-50
    ${quote.validity_state === "expired" ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <IconEdit />
            </button>

            {/* PRINT */}
            <button
              onClick={printQuotation}
              title={
                viewingVersion
                  ? "Close version preview to print quotation"
                  : "Print quotation"
              }
              disabled={!!viewingVersion}
              className={`p-2 rounded border bg-white hover:bg-gray-50
    ${viewingVersion ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <IconPrint />
            </button>

            {/* COPY LINK */}
            <button
              onClick={copyLink}
              title="Copy link"
              className="p-2 rounded border bg-white hover:bg-gray-50"
            >
              <IconCopy />
            </button>

            {/* EMAIL */}
            <div className="relative">
              <button
                title="Send email"
                className="p-2 rounded border bg-white hover:bg-gray-50"
                onClick={() => _setActionsMenuOpen((v) => !v)}
              >
                <IconMail />
              </button>

              {_actionsMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white border rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => {
                      openEmailClient("gmail");
                      _setActionsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    📧 Gmail
                  </button>

                  <button
                    onClick={() => {
                      openEmailClient("outlook");
                      _setActionsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    📨 Outlook
                  </button>
                </div>
              )}
            </div>


            <div className="flex items-center gap-2">

              {/* WON / LOST WORKFLOW */}
              {quote && quote.validity_state !== "expired" && (
                <WonLostDecision
                  quotationId={quote.id}
                  status={quote.status}
                  onWon={handleWon}
                  onLost={handleLost}
                  isLoading={actionLoading}
                />
              )}
            </div>
          </div>
        </div>


        {/* ===== VALIDITY WARNING BANNER ===== */}
        {quote.validity_state && quote.validity_state !== "valid" && (
          <div className="mb-6">
            <ValidityBanner
              validity_state={quote.validity_state}
              remaining_days={quote.remaining_days ?? 0}
            />
          </div>
        )}

        {/* ===== TABS HEADER ===== */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-6 text-sm font-medium">
            {[
              { id: "overview", label: "Overview" },
              { id: "products", label: "Products" },
              { id: "followups", label: "Follow-Ups" },
              { id: "history", label: "History" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`pb-3 transition ${activeTab === t.id
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {quote.validity_state === "expired" && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            This quotation has expired. It must be re-issued before marking WON or LOST.
          </div>
        )}


        {activeTab === "overview" && (
          <div className="space-y-6">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              <div className="lg:col-span-2">
                <div className="bg-white rounded-lg border shadow p-4">


                  <div className="mt-4 border-t pt-4">
                    <h4 className="font-medium">Customer contact</h4>

                    {quote.customer_contact_person && (
                      <div className="mt-2 text-sm text-gray-700">
                        <strong>Contact Person:</strong> {quote.customer_contact_person}
                      </div>
                    )}

                    <div className="mt-2 text-sm text-gray-700">
                      <div>
                        <strong>Address:</strong>
                        <div className="whitespace-pre-wrap">
                          {quote.customer_address ?? "(Customer address not provided)"}
                        </div>
                      </div>

                      {quote.customer_gst && (
                        <div className="mt-2">
                          <strong>GST:</strong> {quote.customer_gst}
                        </div>
                      )}

                      {quote.customer_phone && (
                        <div className="mt-2">
                          <strong>Phone:</strong> {quote.customer_phone}
                        </div>
                      )}

                      {quote.customer_email && (
                        <div className="mt-2">
                          <strong>Email:</strong> {quote.customer_email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="bg-white rounded-lg border shadow p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  Quotation Owner
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    Owner
                  </span>
                </h4>
                <div className="text-sm text-gray-700">
                  <div><strong>Name:</strong> {quote.salesperson_name ?? "—"}</div>
                  {quote.salesperson_phone ? <div className="mt-2"><strong>Phone:</strong> {quote.salesperson_phone}</div> : null}
                  {quote.salesperson_email ? <div className="mt-2"><strong>Email:</strong> {quote.salesperson_email}</div> : null}
                </div>


              </aside>
            </div>

            {/* ================= SECTION 1 — EXECUTIVE SNAPSHOT ================= */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

              {/* STATUS */}
              <StatCard
                label="Status"
                value={
                  followupRiskScore.level === "critical"
                    ? "Pending — Action Required"
                    : followupRiskScore.level === "warning"
                      ? "Pending — Needs Attention"
                      : quote.status ?? "—"
                }
                tone={
                  followupRiskScore.level === "critical"
                    ? "red"
                    : followupRiskScore.level === "warning"
                      ? "amber"
                      : "green"
                }
              />

              {/* DEAL VALUE */}
              <StatCard
                label="Deal Value"
                value={fmt(displayedGrand)}
                tone="green"
              />

              {/* VALIDITY */}
              <StatCard
                label="Validity"
                value={
                  quote.validity_state === "expired"
                    ? "Expired"
                    : quote.remaining_days === 0
                      ? "Expires Today"
                      : `Expires in ${quote.remaining_days} days`
                }
                tone={
                  quote.validity_state === "expired"
                    ? "red"
                    : (quote.remaining_days ?? 99) <= 2
                      ? "amber"
                      : "green"
                }

              />


              {/* VERSION */}
              <StatCard
                label="Version"
                value={
                  versionHistory.length > 0
                    ? `v${quote.version} (${versionHistory.length > 1 ? "Re-issued" : "Original"})`
                    : `v${quote.version ?? "1.0"}`
                }
                tone="blue"
              />

              <StatCard
                label="Payment Terms"
                value={quote.payment_terms || "No payemt terms mentioned"}
                tone="gray"
              />

            </div>
            {/* ================= SECTION 2 — ITEMS SUMMARY ================= */}
            <div className="bg-white border rounded-xl shadow-sm">

              {/* HEADER */}
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Items Summary
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {totals.lines.length} item{totals.lines.length !== 1 ? "s" : ""} ·
                    Quotation value overview
                  </p>
                </div>

                {/* PRIMARY VALUE */}
                <div className="text-right">
                  <div className="text-xs text-gray-500">Total Value</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {fmt(displayedGrand)}
                  </div>
                </div>
              </div>

              {/* SNAPSHOT STRIP */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 py-4 bg-gray-50 border-b">

                <div>
                  <div className="text-xs text-gray-500">Subtotal</div>
                  <div className="font-medium">{fmt(totals.subtotal)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Tax</div>
                  <div className="font-medium">{fmt(totals.tax)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Discounts</div>
                  <div className="font-medium">
                    {totals.lines.some(l => l.discount_percent > 0)
                      ? "Applied"
                      : "Not applied"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Items</div>
                  <div className="font-medium">
                    {totals.lines.length}
                  </div>
                </div>

              </div>

              {/* COLLAPSIBLE DETAIL */}
              <ItemsSummary
                totals={totals}
                displayedGrand={displayedGrand}
                fmt={fmt}
                onViewProducts={() => setActiveTab("products")}
              />

            </div>

            {/* ================= SECTION 3 — TERMS & CONDITIONS ================= */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Terms & Conditions</h3>

              <div className="text-sm text-gray-700 space-y-2">
                {quote.notes ? (
                  <div className="whitespace-pre-wrap">{quote.notes}</div>
                ) : (
                  <div className="text-gray-500">No notes</div>
                )}

                {quote.terms && (
                  <div className="whitespace-pre-wrap">{quote.terms}</div>
                )}

                <div className="pt-3 border-t text-xs text-gray-500">
                  <div>Validity Period: {quote.validity_days ?? "—"} days</div>
                  <div>Prepared by: {quote.salesperson_name ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* ================= SECTION 4 — FOLLOW-UP INTELLIGENCE ================= */}
            <div className="bg-white border rounded-lg p-4 space-y-4">
              {/* HEADER */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Follow-Up Intelligence</h3>
                <p className="text-xs text-gray-500">
                  Risk status and next required customer action
                </p>
                {/* Risk Badge */}
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${followupRiskScore.color === "red"
                    ? "bg-red-100 text-red-700"
                    : followupRiskScore.color === "amber"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                    }`}
                >
                  {followupRiskScore.label}
                </span>
              </div>

              {/* NO FOLLOW-UPS */}
              {followups.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No follow-ups logged yet.
                  <button
                    onClick={() => setActiveTab("followups")}
                    className="ml-2 text-indigo-600 hover:underline"
                  >
                    Add Follow-Up →
                  </button>
                </div>
              ) : (
                <>




                  {(() => {
                    if (!followups.length) return null;

                    // 1️⃣ Prefer latest NON-completed follow-up
                    // Always show most recent interaction (completed or not)
                    // 1️⃣ Prefer most recent OPEN follow-up
                    const last = [...followups]
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime()
                      )[0];

                    if (!last) return null;


                    if (!last) return null;


                    const lastDate = new Date(last.followup_date);

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    lastDate.setHours(0, 0, 0, 0);



                    const meta =
                      FOLLOWUP_TYPE_META[
                      last.followup_type as keyof typeof FOLLOWUP_TYPE_META
                      ] || FOLLOWUP_TYPE_META.other;

                    // Day-level overdue check
                    let isOverdue = false;
                    if (!last.is_completed && last.next_followup_date) {
                      const next = new Date(last.next_followup_date);
                      next.setHours(0, 0, 0, 0);
                      isOverdue = next <= today;
                    }

                    return (
                      <div
                        className={`border rounded-lg p-3 space-y-2 ${isOverdue ? "bg-red-50 border-red-300" : "bg-slate-50"
                          }`}
                      >
                        {/* HEADER */}
                        <div className="flex items-center justify-between gap-2">
                          {/* LEFT GROUP */}
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                              Last Interaction
                            </div>

                            {isOverdue && (
                              <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                                ⚠ Attention Required
                              </span>
                            )}
                          </div>

                          {/* RIGHT BADGE */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {/* NOTE */}
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">
                          {last.note || "—"}
                        </div>

                        {/* META */}
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>
                            Logged{" "}
                            {Math.floor(
                              (today.getTime() - new Date(last.created_at).getTime()) /
                              (1000 * 60 * 60 * 24)
                            )}{" "}
                            day(s) ago
                            {last.followup_date && (
                              <>
                                {" "}
                                · Interaction on {formatDateDDMMYYYY(last.followup_date)}
                              </>
                            )}
                          </div>

                          <div>
                            by <strong>{last.created_by_name || "—"}</strong>
                          </div>
                        </div>

                        {/* ACTION */}
                        <div className="flex justify-end pt-2">
                          {!last.is_completed ? (
                            <button
                              onClick={() => markFollowupDone(last.id)}
                              className="
        inline-flex items-center gap-1.5
        px-3 py-1.5
        text-xs font-medium
        rounded-full
        bg-green-50 text-green-700
        border border-green-200
        hover:bg-green-100
        hover:border-green-300
        transition
      "
                            >
                              ✓ Mark as Completed
                            </button>
                          ) : (
                            <span
                              className="
        inline-flex items-center gap-1.5
        px-3 py-1.5
        text-xs font-medium
        rounded-full
        bg-green-100 text-green-700
        border border-green-200
      "
                            >
                              ✓ Completed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}


                  {/* NEXT FOLLOW-UP */}
                  {nextPlannedFollowup && (() => {
                    const meta =
                      FOLLOWUP_TYPE_META[
                      nextPlannedFollowup.followup_type as keyof typeof FOLLOWUP_TYPE_META
                      ] || FOLLOWUP_TYPE_META.other;

                    return (
                      <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">
                            Next Follow-Up
                          </div>

                          <div className="text-sm font-semibold">
                            {nextPlannedFollowup.d.toLocaleDateString()}
                          </div>

                          <div className="text-xs text-gray-500 mt-1">
                            Owner: <strong>{nextPlannedFollowup.created_by_name || "—"}</strong>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${nextPlannedFollowup.tone}`}>
                          {meta.label} ·{" "}
                          {nextPlannedFollowup.diffDays < 0
                            ? `Overdue (${Math.abs(nextPlannedFollowup.diffDays)}d)`
                            : nextPlannedFollowup.diffDays === 0
                              ? "Today"
                              : nextPlannedFollowup.diffDays === 1
                                ? "Tomorrow"
                                : `In ${nextPlannedFollowup.diffDays} days`}
                        </span>
                      </div>
                    );
                  })()}

                  {/* CTA */}
                  <div className="text-right">
                    <button
                      onClick={() => setActiveTab("followups")}
                      className="text-indigo-600 text-sm hover:underline"
                    >
                      View Full Timeline →
                    </button>
                  </div>
                </>
              )}
            </div>



            {/* ================= SECTION 5 — STAKEHOLDERS ================= */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs text-gray-500">Salesperson</div>
                <div className="font-semibold">{quote.salesperson_name || "—"}</div>
                {quote.salesperson_email && (
                  <div className="text-xs text-gray-500">
                    {quote.salesperson_email}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-xs text-gray-500">Customer Contact</div>
                <div className="text-sm whitespace-pre-wrap text-gray-700">
                  {quote.customer_address ?? "—"}
                </div>
              </div>
            </div>

            {/* ================= SECTION 6 — FINANCIAL HEALTH (ADMIN) ================= */}
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Financial Health</h3>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                  Deal Size: {fmt(displayedGrand)}
                </span>

                {totals.lines.some((l) => l.discount_percent > 0) && (
                  <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700">
                    Discount Applied
                  </span>
                )}

                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                  Tax Included
                </span>
              </div>
            </div>

            {/* ================= SECTION 7 — SYSTEM STATUS ================= */}
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">System Status</h3>

              <div className="flex gap-6 text-sm">
                <div>
                  Editable:{" "}
                  <strong>
                    {quote.validity_state === "expired" ? "No" : "Yes"}
                  </strong>
                </div>

                <div>
                  Follow-Ups:{" "}
                  <strong>
                    {quote.status === "pending" ? "Enabled" : "Locked"}
                  </strong>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Products Tab */}

        {activeTab === "products" && (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">

            {/* HEADER */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Products</h3>
                <p className="text-xs text-gray-500">
                  Full item-level breakdown (current version)
                </p>
              </div>
              <div className="text-xs text-gray-400">
                Rows: {totals.lines.length}
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">

                {/* ===== TABLE HEAD ===== */}
                <thead className="bg-slate-50 border-b">
                  <tr className="text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left w-10">#</th>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-center w-16">Qty</th>
                    <th className="px-4 py-3 text-right w-24">Rate</th>
                    <th className="px-4 py-3 text-right w-28">Base Total</th>
                    <th className="px-4 py-3 text-center w-20">Disc</th>
                    <th className="px-4 py-3 text-center w-16">Tax</th>
                    <th className="px-4 py-3 text-right w-28">Line Total</th>
                  </tr>
                </thead>

                {/* ===== TABLE BODY ===== */}
                <tbody>
                  {totals.lines.map((l: any, idx: number) => {
                    const isOpen = !!expandedRows[idx];
                    const baseTotal = l.qty * l.unit_price;

                    return (
                      <React.Fragment key={idx}>
                        {/* MAIN ROW */}
                        <tr
                          className="border-b hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleRow(idx)}
                        >
                          <td className="px-4 py-3 text-gray-400">{idx + 1}</td>

                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {l.product_name}
                            </div>
                            <div className="text-xs text-gray-400">
                              Click to {isOpen ? "hide" : "view"} description
                            </div>
                          </td>

                          <td className="px-4 py-3 text-center">{l.qty}</td>

                          <td className="px-4 py-3 text-right">
                            {fmt(l.unit_price)}
                          </td>

                          {/* ✅ BASE TOTAL */}
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmt(baseTotal)}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {l.discount_percent > 0 ? (
                              <span className="text-rose-600 font-medium">
                                −{l.discount_percent}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {l.tax_rate}%
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {fmt(l.lineTotal)}
                          </td>
                        </tr>

                        {/* EXPANDED DESCRIPTION */}
                        {isOpen && (
                          <tr className="bg-slate-50">
                            <td />
                            <td colSpan={7} className="px-4 pb-4 text-xs text-gray-600">
                              {l.description || "No description provided"}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* ===== TABLE FOOTER ===== */}
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={7} className="px-4 py-3 text-right">
                      Grand Total
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmt(displayedGrand)}
                    </td>
                  </tr>
                </tfoot>

              </table>
            </div>
          </div>
        )}



        {/* ================= FOLLOW-UPS TAB (PRO UI) ================= */}
        {activeTab === "followups" && (
          <div className="space-y-6">

            {/* HEADER */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Follow-Ups
                </h3>
                <p className="text-xs text-gray-500">
                  Customer interactions & reminders timeline
                </p>
              </div>

              <button
                onClick={() => setShowAddFollowup(true)}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm"
              >
                + Add Follow-Up
              </button>
            </div>

            {/* SLA COUNTERS — ADD HERE */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Missed"
                value={String(slaCounters.missed)}
                tone="red"
              />
              <StatCard
                label="Due Today"
                value={String(slaCounters.today)}
                tone="amber"
              />
              <StatCard
                label="Upcoming"
                value={String(slaCounters.upcoming)}
                tone="green"
              />
            </div>

            {/* CONTENT */}
            <div className="bg-white border rounded-xl p-6">

              {loadingFollowups ? (
                <div className="text-sm text-gray-500">Loading follow-ups…</div>
              ) : followups.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-500 text-sm mb-2">
                    No follow-ups recorded yet
                  </div>
                  <div className="text-xs text-gray-400 mb-4">
                    Start logging customer communication to track engagement
                  </div>
                  <button
                    onClick={() => setShowAddFollowup(true)}
                    className="px-4 py-2 rounded bg-indigo-600 text-white text-sm"
                  >
                    Add First Follow-Up
                  </button>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6">

                  {/* NEXT FOLLOW-UP INDICATOR */}
                  {nextPlannedFollowup && (() => {
                    const meta =
                      FOLLOWUP_TYPE_META[
                      nextPlannedFollowup.followup_type as keyof typeof FOLLOWUP_TYPE_META
                      ] || FOLLOWUP_TYPE_META.other;

                    return (
                      <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">
                            Next Follow-Up
                          </div>

                          <div className="text-sm font-semibold">
                            {nextPlannedFollowup.d.toLocaleDateString()}
                          </div>

                          <div className="text-xs text-gray-500 mt-1">
                            Owner: <strong>{nextPlannedFollowup.created_by_name || "—"}</strong>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${nextPlannedFollowup.tone}`}>
                          {meta.label} ·{" "}
                          {nextPlannedFollowup.diffDays < 0
                            ? `Overdue (${Math.abs(nextPlannedFollowup.diffDays)}d)`
                            : nextPlannedFollowup.diffDays === 0
                              ? "Today"
                              : `In ${nextPlannedFollowup.diffDays}d`}
                        </span>
                      </div>
                    );
                  })()}
                  {/* TIMELINE LINE */}
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />

                  {followups.map((f, idx) => {
                    const date = new Date(f.followup_date);
                    const daysAgo = Math.floor(
                      (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
                    );



                    const meta =
                      FOLLOWUP_TYPE_META[
                      f.followup_type as keyof typeof FOLLOWUP_TYPE_META
                      ] || FOLLOWUP_TYPE_META.other;

                    const isCompleted = f.is_completed;

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const next = f.next_followup_date
                      ? new Date(f.next_followup_date)
                      : null;

                    if (next) next.setHours(0, 0, 0, 0);

                    const isOverdue =
                      !isCompleted &&
                      next &&
                      next <= today;


                    return (
                      <div
                        key={f.id}
                        className={`relative border rounded-lg p-4 shadow-sm transition
    ${isOverdue ? "bg-red-50 border-red-300" : "bg-white hover:shadow-md"}
  `}
                      >
                        {/* DOT */}
                        <div className="absolute -left-[22px] top-5 h-3 w-3 rounded-full bg-indigo-600 border-2 border-white" />

                        {/* HEADER */}
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}
                            >
                              {meta.label}
                            </span>

                            {isOverdue && (
                              <span className="text-xs text-red-600 font-medium">
                                ⚠ Owner Attention Required
                              </span>
                            )}

                            <span className="text-xs text-gray-500">
                              #{followups.length - idx}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-gray-500">
                              {date.toLocaleDateString()}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {daysAgo === 0 ? "Today" : `${daysAgo} day(s) ago`}
                            </div>
                          </div>
                        </div>

                        {/* BODY — NOTE */}
                        <div className="text-sm text-gray-800 whitespace-pre-wrap mb-3">
                          {f.note || "—"}
                        </div>

                        {/* FOOTER */}
                        <div className="flex justify-between items-center text-xs text-gray-500 gap-2">
                          <span>
                            Logged by <strong>{f.created_by_name || "—"}</strong>
                          </span>

                          <div className="flex items-center gap-2">
                            {(() => {
                              const nextMeta = getNextFollowupMeta(
                                f.next_followup_date,
                                f.followup_type
                              );

                              return nextMeta ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full font-medium ${nextMeta.color}`}
                                >
                                  {nextMeta.label}
                                </span>
                              ) : null;
                            })()}

                            {/* ✅ COMPLETION STATE */}
                            {!f.is_completed ? (
                              <button
                                onClick={() => markFollowupDone(f.id)}
                                className="
        inline-flex items-center gap-1.5
        px-3 py-1.5
        text-xs font-medium
        rounded-full
        bg-green-50 text-green-700
        border border-green-200
        hover:bg-green-100
        hover:border-green-300
        transition
      "
                              >
                                ✓ Mark as Completed
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5
        px-3 py-1.5
        text-xs font-medium
        rounded-full
        bg-green-100 text-green-700
        border border-green-200">
                                ✓ Completed
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}



        {/* History  Tab */}
        {activeTab === "history" && (
          <div className="space-y-6">

            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Version History</h3>

              <VersionHistory
                versions={versionHistory}
                isLoading={historyLoading}
                onViewVersion={(version) => setViewingVersion(version)}
                layout="vertical"
              />
            </div>

            {viewingVersion && (
              <VersionViewer
                quotationId={quote.id}
                versionNumber={viewingVersion}
                onClose={() => setViewingVersion(null)}
              />
            )}

          </div>
        )}


      </div>

      <ReIssueModal
        open={showReIssue}
        onClose={() => setShowReIssue(false)}
        onConfirm={handleReIssue}
      />

      {showAddFollowup && quote?.id && (
        <AddFollowupModal
          quotationId={quote.id}
          onClose={() => setShowAddFollowup(false)}
          onCreated={() => {
            setShowAddFollowup(false);
            api.getQuotationFollowups(quote.id).then(data =>
              setFollowups(
                Array.isArray(data)
                  ? data.map(f => ({
                    ...f,
                    is_completed: Boolean(f.is_completed),
                  }))
                  : []
              )
            );
          }}
        />
      )}



      <SmallToast message={toast} onClose={() => setToast(null)} />
      <ConfirmModal
        open={confirmOpen}
        loading={actionLoading}
        title={confirmAction === "approve" ? "Approve quotation" : "Reject quotation"}
        message={confirmAction === "approve" ? "Approve this quotation? This action cannot be undone." : "Mark this quotation as rejected?"}
        onConfirm={runConfirmAction}
        onCancel={() => { setConfirmOpen(false); setConfirmAction(null); }}
      />
      <ErrorModal open={errorOpen} title="Operation failed" message={errorMessage} onClose={() => setErrorOpen(false)} />
    </Layout>
  );
}

/* ---------- small utility (module-scope) ---------- */
// @ts-ignore unused function
function _escapeHtmlForPreview(s: string) {
  if (!s) return "";
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
