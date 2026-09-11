import { parseAllReferences } from "@jw-reminders/shared";
import { resolveReferences } from "../../../../services/research-chat/wol-resolver.service.js";

export async function resolveTextReferences(text: string) {
  const { allRefs, bibleRefs, wolRefs } = parseAllReferences(text);
  const resolved = await resolveReferences(allRefs);

  return {
    parsed: { bibleRefs, wolRefs },
    resolved,
  };
}
