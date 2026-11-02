import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "career-documents";

/** Reads go through the audited read_authorised_file check (as the caller);
 *  only after it succeeds is the private object fetched server-side. */
export const downloadCareerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("read_authorised_file", {
      _file: data.fileId,
      _purpose: "career_document",
    });
    const file = rows?.[0];
    if (error || !file) throw new Error("Access denied");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(file.storage_path);
    if (dlError || !blob) throw new Error("Could not load the document");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { name: file.original_name, mimeType: file.mime_type ?? "application/octet-stream", base64: btoa(binary) };
  });

/** Ownership is checked by delete_my_career_document (as the caller); the
 *  stored object is then removed server-side. */
export const deleteCareerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: path, error } = await context.supabase.rpc("delete_my_career_document", {
      _file: data.fileId,
    });
    if (error || !path) throw new Error(error?.message ?? "Access denied");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return { ok: true };
  });
