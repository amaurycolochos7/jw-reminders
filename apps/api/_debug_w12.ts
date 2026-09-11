import { resolveReferences } from "./src/services/research-chat/wol-resolver.service.js";
import { parseAllReferences } from "@jw-reminders/shared";

async function main() {
  const { allRefs } = parseAllReferences("w12 1/5 pág. 9 párr. 2");
  console.log("Parsed ref:", JSON.stringify(allRefs[0], null, 2));
  const r = (await resolveReferences(allRefs))[0];
  console.log("\nResult:");
  console.log("  status:", r.status);
  console.log("  sourceOrigin:", (r as any).sourceOrigin);
  console.log("  notes:", r.notes);
  console.log("  url:", r.url);
  console.log("  title:", r.title);
  console.log("  blocks:", r.extractedContent?.length);
  if (r.extractedContent?.[0]) {
    console.log("  text:", r.extractedContent[0].text?.substring(0, 150));
  }
}
main();
