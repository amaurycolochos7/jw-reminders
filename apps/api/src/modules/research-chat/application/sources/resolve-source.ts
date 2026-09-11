import { parseAllReferences } from "@jw-reminders/shared";
import { resolveReferences } from "../../../../services/research-chat/wol-resolver.service.js";

export async function resolveSource(reference: string) {
  const { allRefs } = parseAllReferences(reference);
  if (allRefs.length === 0) {
    throw new Error("No se detectó una referencia válida en el texto");
  }

  const resolved = await resolveReferences(allRefs);
  const result = resolved[0];

  if (!result || result.status !== "resolved") {
    return {
      status: result?.status || "failed",
      notes: result?.notes || "No se pudo resolver la referencia",
      extractedContent: [],
    };
  }

  return {
    status: result.status,
    type: result.type,
    sourceOrigin: result.sourceOrigin,
    title: result.title,
    publication: result.publication,
    url: result.url,
    urlType: result.urlType,
    extractedContent: result.extractedContent || [],
  };
}
