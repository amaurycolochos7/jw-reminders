"""
Extract US leads for businesses that typically need websites.
Uses small batch sizes to conserve Apify credits ($0.36 remaining).
"""
import urllib.request, urllib.parse, json, time

API = "http://localhost:8080/api"

# High-value US business categories that NEED websites
categories = [
    "auto repair shop",
    "restaurant",
    "landscaping company",
    "cleaning service",
    "plumber",
    "electrician",
    "hair salon",
    "barber shop",
    "dental clinic",
    "pet groomer",
    "laundromat",
    "roofing company",
    "moving company",
    "fitness studio",
    "bakery",
    "florist",
    "tattoo shop",
    "nail salon",
    "day care",
    "yoga studio",
]

# Major US cities with big small-business presence
cities = [
    "Houston, Texas",
    "Dallas, Texas",
    "Los Angeles, California",
    "Miami, Florida",
    "Phoenix, Arizona",
    "Chicago, Illinois",
]

# Combine: pick top combos (limit to save credits)
searches = []
for city in cities[:3]:  # Start with 3 cities
    for cat in categories[:5]:  # 5 categories each = 15 searches
        searches.append((cat, city))

print(f"Will attempt {len(searches)} extractions (max 20 results each)")
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
            print("\n  ** APIFY CREDITS EXHAUSTED — stopping **")
            break
    except Exception as e:
        print(f"  ERROR: {e}")
        failed += 1
    
    if i < len(searches) - 1:
        time.sleep(2)

print("\n" + "=" * 60)
print(f"Done! Success: {success}, Failed: {failed}, Total new leads: {total_saved}")
