"""
Extract Mexico leads for NEW cities not yet scraped.
Uses proven categories that work well.
"""
import urllib.request, urllib.parse, json, time

API = "http://localhost:8080/api"

# Proven categories for Mexico
categories = [
    "taller mecánico",
    "restaurante",
    "salón de belleza",
    "clínica dental",
    "gimnasio",
    "lavandería",
    "refaccionaria",
    "consultorio médico",
    "veterinaria",
    "papelería",
]

# NEW Mexican cities (not yet scraped)
cities = [
    "Mérida, Yucatán",
    "León, Guanajuato",
    "Toluca, Estado de México",
    "Aguascalientes",
    "Chihuahua",
    "Hermosillo, Sonora",
    "Saltillo, Coahuila",
    "Veracruz",
    "Morelia, Michoacán",
    "San Luis Potosí",
]

# Build search combos: 5 categories x 10 cities = 50 searches
searches = []
for city in cities:
    for cat in categories[:5]:  # Top 5 categories per city
        searches.append((cat, city))

searches = searches[28:]

print(f"Will attempt {len(searches)} extractions (max 20 results each)")
print(f"Cities: {len(cities)}, Categories per city: 5")
print("=" * 60)

success = 0
failed = 0
total_saved = 0

for i, (keyword, location) in enumerate(searches):
    print(f"\n[{i+1}/{len(searches)}] {keyword} | {location}")
    
    try:
        params = urllib.parse.urlencode({
            "keyword": keyword,
            "location": location,
            "max_results": 20
        })
        url = f"{API}/extract?{params}"
        req = urllib.request.Request(url, method='POST')
        resp = urllib.request.urlopen(req, timeout=300)
        data = json.loads(resp.read().decode())
        
        saved = data.get('saved', data.get('saved_count', 0))
        total_saved += saved if isinstance(saved, int) else 0
        print(f"  OK - Saved: {saved}")
        success += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:150]}")
        failed += 1
        if e.code == 402 or "not-enough-usage" in body:
            print("\n  ** CREDITOS APIFY AGOTADOS — deteniendo **")
            break
    except Exception as e:
        print(f"  ERROR: {e}")
        failed += 1
    
    if i < len(searches) - 1:
        time.sleep(2)

print("\n" + "=" * 60)
print(f"Done! Success: {success}, Failed: {failed}, Total new leads: {total_saved}")
