"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import {
  importStrongCsvForUser,
  type ImportResult,
} from "@/lib/import-persist";

export async function importCsv(formData: FormData): Promise<ImportResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { added: 0, skipped: 0, warnings: [], error: "Not authenticated." };
  const file = formData.get("file") as File | null;
  if (!file)
    return { added: 0, skipped: 0, warnings: [], error: "No file provided." };
  const text = await file.text();
  return importStrongCsvForUser(session.user.id, text);
}
