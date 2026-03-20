import api from "@/lib/api";
import type {
  InvoiceWithUser,
  InvoiceWithChapter,
  ChapterBillInvoice,
  CreateInvoiceRequest,
  BulkCreateInvoiceRequest,
  CreateRegionalInvoiceRequest,
  BulkRegionalInvoiceRequest,
  InvoiceSummary,
} from "@/types";

// ── Chapter → Member invoices ───────────────────────────────────────────

export async function fetchInvoices(params?: {
  status?: string;
  user_id?: string;
}): Promise<InvoiceWithUser[]> {
  const { data } = await api.get("/invoices", { params });
  return data.invoices;
}

export async function fetchInvoice(invoiceId: string): Promise<InvoiceWithUser> {
  const { data } = await api.get(`/invoices/${invoiceId}`);
  return data;
}

export async function createInvoice(req: CreateInvoiceRequest): Promise<InvoiceWithUser> {
  const { data } = await api.post("/invoices", req);
  return data;
}

export async function bulkCreateInvoices(req: BulkCreateInvoiceRequest): Promise<{
  message: string;
  count: number;
  invoices: InvoiceWithUser[];
}> {
  const { data } = await api.post("/invoices/bulk", req);
  return data;
}

export async function updateInvoice(
  invoiceId: string,
  updates: Record<string, unknown>
): Promise<InvoiceWithUser> {
  const { data } = await api.patch(`/invoices/${invoiceId}`, updates);
  return data;
}

export async function sendInvoice(invoiceId: string): Promise<InvoiceWithUser> {
  const { data } = await api.post(`/invoices/${invoiceId}/send`);
  return data;
}

export async function bulkSendInvoices(invoiceIds?: string[]): Promise<{
  message: string;
  count: number;
}> {
  const { data } = await api.post("/invoices/bulk-send", {
    invoice_ids: invoiceIds ?? [],
  });
  return data;
}

export async function fetchInvoiceSummary(): Promise<InvoiceSummary> {
  const { data } = await api.get("/invoices/summary");
  return data;
}

// ── Chapter bills (regional invoices billed TO this chapter) ─────────────

export async function fetchChapterBills(): Promise<ChapterBillInvoice[]> {
  const { data } = await api.get("/invoices/chapter-bills");
  return data.invoices;
}

// ── Regional → Chapter invoices ─────────────────────────────────────────

export async function fetchRegionalInvoices(regionId: string): Promise<InvoiceWithChapter[]> {
  const { data } = await api.get(`/invoices/regional/${regionId}`);
  return data.invoices;
}

export async function createRegionalInvoice(
  regionId: string,
  req: CreateRegionalInvoiceRequest
): Promise<InvoiceWithChapter> {
  const { data } = await api.post(`/invoices/regional/${regionId}`, req);
  return data;
}

export async function bulkCreateRegionalInvoices(
  regionId: string,
  req: BulkRegionalInvoiceRequest
): Promise<{ message: string; count: number; invoices: InvoiceWithChapter[] }> {
  const { data } = await api.post(`/invoices/regional/${regionId}/bulk`, req);
  return data;
}

export async function updateRegionalInvoice(
  regionId: string,
  invoiceId: string,
  updates: Record<string, unknown>
): Promise<InvoiceWithChapter> {
  const { data } = await api.patch(`/invoices/regional/${regionId}/${invoiceId}`, updates);
  return data;
}
