import api from "@/lib/api";
import type {
  Expense,
  ExpenseListResponse,
  ExpenseStatus,
  CreateExpenseRequest,
  UpdateExpenseRequest,
} from "@/types";

export async function fetchExpenses(status?: ExpenseStatus): Promise<ExpenseListResponse> {
  const params = status ? { status } : {};
  const { data } = await api.get("/expenses", { params });
  return data;
}

export async function submitExpense(payload: CreateExpenseRequest): Promise<Expense> {
  const { data } = await api.post("/expenses", payload);
  return data;
}

export async function getExpense(id: string): Promise<Expense> {
  const { data } = await api.get(`/expenses/${id}`);
  return data;
}

export async function updateExpense(
  id: string,
  payload: UpdateExpenseRequest
): Promise<Expense> {
  const { data } = await api.patch(`/expenses/${id}`, payload);
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

export async function uploadReceipt(id: string, file: File): Promise<Expense> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(`/expenses/${id}/receipt`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export function getExportUrl(year?: number): string {
  const base = "/api/expenses/export";
  return year ? `${base}?year=${year}` : base;
}
