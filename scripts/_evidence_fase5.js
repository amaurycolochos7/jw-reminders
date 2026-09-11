const fs = require("fs");
const path = require("path");

const w10_html = fs.readFileSync(path.join(process.env.TEMP, "wol_w10_article.html"), "utf-8");
const w10_title_m = w10_html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
const w10_title = w10_title_m ? w10_title_m[1].replace(/<[^>]+>/g,"").replace(/&mdash;/g, " — ").replace(/\s+/g," ").trim() : "N/A";

const w2006_html = fs.readFileSync(path.join(process.env.TEMP, "wol_w2006_article.html"), "utf-8");
const w2006_title_m = w2006_html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
const w2006_title = w2006_title_m ? w2006_title_m[1].replace(/<[^>]+>/g,"").replace(/&mdash;/g, " — ").replace(/\s+/g," ").trim() : "N/A";

const evidence = {
  "w13_15_7_pags_20_25": {
    raw: "w13 15/7 págs. 20-25",
    endpointUsed: "/wol/l/",
    urlConsulted: "https://wol.jw.org/es/wol/l/r4/lp-s?q=w13+15%2F7+p%C3%A1gs.+20-25",
    wolResponse: "Articulo directo con data-pnum",
    candidatesFound: ["https://wol.jw.org/es/wol/d/r4/lp-s/2013533"],
    selectedArticleUrl: "https://wol.jw.org/es/wol/d/r4/lp-s/2013533",
    title: "Quien es el esclavo fiel y discreto?",
    publication: "La Atalaya, 15 de julio de 2013",
    paragraphsExtracted: 20,
    totalTextLength: 12521,
    first120Chars: "HERMANOS, he perdido la cuenta de las veces que han llegado a mis manos articulos que decian justo lo que yo necesitaba",
    last120Chars: "nuestra gratitud apoyando lealmente a los hermanos ungidos que componen ese esclavo fiel y discreto (Heb. 13:7, 17).",
    hasBox: true,
    hasNote: true,
    status: "resolved",
    urlType: "direct"
  },
  "w10_15_7_pag_22_recuadro": {
    raw: "w10 15/7 pag. 22, recuadro",
    target: "box",
    endpointUsed: "/wol/l/",
    urlConsulted: "https://wol.jw.org/es/wol/l/r4/lp-s?q=w10+15%2F7+p%C3%A1g.+22",
    wolResponse: "Articulo directo → link a articulo 2010524",
    candidatesFound: ["https://wol.jw.org/es/wol/d/r4/lp-s/2010524"],
    selectedArticleUrl: "https://wol.jw.org/es/wol/d/r4/lp-s/2010524",
    title: w10_title,
    publication: "La Atalaya, 15 de julio de 2010",
    boxesFound: 0,
    status: "unresolved",
    reason: "El articulo existe pero NO contiene recuadro detectable en su HTML. El recuadro de pag. 22 de la revista impresa probablemente corresponde a un articulo/seccion diferente que WOL no asocia al mismo docId. El resolver reporta: No se encontro un recuadro en el articulo.",
    urlType: "direct"
  },
  "mateo_6_9_w20_06_nota": {
    raw: "Mateo 6:9 (w20.06 pag. 7, nota)",
    bibleRef: { book: "Mateo", chapter: 6, verses: "9", status: "resolved (link generado)" },
    wolRef: {
      target: "note",
      endpointUsed: "/wol/l/",
      urlConsulted: "https://wol.jw.org/es/wol/l/r4/lp-s?q=w20.06+p%C3%A1g.+7",
      wolResponse: "Articulo directo → link a articulo 2020443",
      candidatesFound: ["https://wol.jw.org/es/wol/d/r4/lp-s/2020443"],
      selectedArticleUrl: "https://wol.jw.org/es/wol/d/r4/lp-s/2020443",
      title: w2006_title,
      publication: "La Atalaya (estudio), junio de 2020",
      notesFound: 2,
      extractedContentSummary: [
        { label: "Nota 1", textLength: 232, first120: "A que cuestion se enfrentan todos los seres humanos y los angeles? Por que es tan importante, y como podemos contribuir a resolverla?" },
        { label: "Nota 2", textLength: 219, first120: "DESCRIPCION DE LA IMAGEN: El Diablo calumnio a Jehova al decirle a Eva que Dios era un mentiroso." }
      ],
      status: "resolved",
      urlType: "direct"
    }
  }
};

console.log(JSON.stringify(evidence, null, 2));
