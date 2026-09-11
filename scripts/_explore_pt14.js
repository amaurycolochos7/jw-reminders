const Database = require("better-sqlite3");
const db = new Database("pt14_S_extracted/contents_db/pt14_S.db", { readonly: true });

// All lessons
console.log("=== ALL LESSONS ===");
const allDocs = db.prepare("SELECT DocumentId, ContextTitle, Title, ChapterNumber FROM Document WHERE ContextTitle IS NOT NULL ORDER BY DocumentId").all();
for (const d of allDocs) {
  console.log(`Doc ${d.DocumentId}: ${d.ContextTitle} | ${d.Title}`);
}

// PublicationViewItem hierarchy (DÍA structure)
console.log("\n=== NAVIGATION HIERARCHY ===");
const viewItems = db.prepare("SELECT PublicationViewItemId, ParentPublicationViewItemId, Title, DefaultDocumentId FROM PublicationViewItem ORDER BY PublicationViewItemId").all();
for (const v of viewItems) {
  const indent = v.ParentPublicationViewItemId > 1 ? "  " : "";
  console.log(`${indent}ViewItem ${v.PublicationViewItemId} (parent=${v.ParentPublicationViewItemId}): ${v.Title} → doc ${v.DefaultDocumentId}`);
}

// Extracts for Lección 3A (need to find its DocumentId)
const leccion3A = allDocs.find(d => d.ContextTitle && d.ContextTitle.includes("3A"));
if (leccion3A) {
  console.log("\n=== EXTRACTS FOR LECCIÓN 3A (Doc " + leccion3A.DocumentId + ") ===");
  const extracts = db.prepare(`
    SELECT de.DocumentExtractId, de.BeginParagraphOrdinal, de.EndParagraphOrdinal,
           e.ExtractId, e.Link, e.Caption, e.RefPublicationId, e.RefMepsDocumentId,
           e.RefBeginParagraphOrdinal, e.RefEndParagraphOrdinal
    FROM DocumentExtract de
    JOIN Extract e ON de.ExtractId = e.ExtractId
    WHERE de.DocumentId = ?
    ORDER BY de.BeginParagraphOrdinal
  `).all(leccion3A.DocumentId);
  
  for (const ex of extracts) {
    // Clean caption from HTML
    const caption = (ex.Caption || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`  Párr ${ex.BeginParagraphOrdinal}: ${caption}`);
    console.log(`    Link: ${ex.Link} | RefDoc: ${ex.RefMepsDocumentId} | RefPárrs: ${ex.RefBeginParagraphOrdinal}-${ex.RefEndParagraphOrdinal}`);
  }
}

// Bible citations for same lesson
if (leccion3A) {
  console.log("\n=== BIBLE CITATIONS FOR LECCIÓN 3A ===");
  const bibles = db.prepare(`
    SELECT bc.BibleCitationId, bc.ParagraphOrdinal, bc.FirstBibleVerseId, bc.LastBibleVerseId, 
           h.Link
    FROM BibleCitation bc
    LEFT JOIN Hyperlink h ON bc.HyperlinkId = h.HyperlinkId
    WHERE bc.DocumentId = ?
    ORDER BY bc.ParagraphOrdinal
    LIMIT 20
  `).all(leccion3A.DocumentId);
  
  for (const b of bibles) {
    console.log(`  Párr ${b.ParagraphOrdinal}: verseIds ${b.FirstBibleVerseId}-${b.LastBibleVerseId} | ${b.Link}`);
  }
}

db.close();
