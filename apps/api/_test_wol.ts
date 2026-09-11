const f = (url: string) => fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "es" } });

async function main() {
  // Test the /wol/l/ and /wol/pl/ endpoints (publication lookup)
  const urls = [
    "https://wol.jw.org/es/wol/l/r4/lp-s?q=w15+15%2F12+p%C3%A1g.+8+p%C3%A1rrs.+16%2C+17",
    "https://wol.jw.org/es/wol/pl/r4/lp-s?q=kr+p%C3%A1g.+84+p%C3%A1rr.+16",
  ];

  for (const url of urls) {
    console.log("=== " + decodeURIComponent(url.split("?q=")[1] || "") + " ===");
    const r = await f(url);
    console.log("Status:", r.status);
    if (!r.ok) continue;

    const h = await r.text();
    const title = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 80);
    const hasPnum = /data-pnum/i.test(h);
    const docLinks = [...new Set((h.match(/\/es\/wol\/d\/r4\/lp-s\/\d+/g) || []))];
    
    console.log("Title:", title);
    console.log("Is article page (data-pnum):", hasPnum);
    console.log("Doc links found:", docLinks.length);
    
    if (hasPnum) {
      const pnums = (h.match(/data-pnum="\d+"/g) || []).map(s => parseInt(s.replace(/\D/g, "")));
      const unique = [...new Set(pnums)].sort((a, b) => a - b);
      console.log("Paragraph numbers:", unique.join(", "));
      
      // Extract paragraph 16 if it exists
      const marker16 = 'data-pnum="16"';
      const idx16 = h.indexOf(marker16);
      if (idx16 > 0) {
        const before = h.slice(Math.max(0, idx16 - 300), idx16);
        const pStart = before.lastIndexOf("<p");
        const fullStart = Math.max(0, idx16 - 300) + pStart;
        const pEnd = h.indexOf("</p>", idx16);
        if (pEnd > 0) {
          const text = h.slice(fullStart, pEnd + 4).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          console.log("P16 first100:", text.slice(0, 100));
        }
      }
    }
    
    if (docLinks.length > 0 && docLinks.length <= 10) {
      docLinks.forEach(l => console.log("  Link:", l));
    }
    console.log();
  }
}

main().catch(console.error);
