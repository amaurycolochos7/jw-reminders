"""
Re-extract all past searches from Apify to recover lost leads.
Run this while the main server (uvicorn) is running on port 8080.
Uses urllib to avoid needing aiohttp installed.
"""
import sqlite3
import urllib.request
import json
import time

API_BASE = "http://localhost:8080/api"

def re_extract_all():
    conn = sqlite3.connect('leads.db')
    c = conn.cursor()
    c.execute("SELECT DISTINCT keyword, location FROM searches")
    searches = c.fetchall()
    conn.close()

    print(f"Found {len(searches)} unique searches to re-extract")
    print("=" * 60)

    success = 0
    failed = 0
    total_leads = 0

    for i, (keyword, location) in enumerate(searches):
        print(f"\n[{i+1}/{len(searches)}] {keyword} | {location}")
        
        try:
            url = f"{API_BASE}/extract?keyword={urllib.parse.quote(keyword)}&location={urllib.parse.quote(location)}&max_results=100"
            req = urllib.request.Request(url, method='POST')
            resp = urllib.request.urlopen(req, timeout=300)
            data = json.loads(resp.read().decode())
            
            saved = data.get('saved_count', data.get('new_leads', 0))
            total_leads += saved if isinstance(saved, int) else 0
            print(f"  OK - Saved: {saved}")
            success += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"  HTTP ERROR {e.code}: {body[:200]}")
            failed += 1
            if e.code == 402:
                print("\n  ** APIFY CREDITS EXHAUSTED - stopping **")
                break
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1
        
        # Delay between extractions to avoid rate limits
        if i < len(searches) - 1:
            print("  Waiting 3 seconds...")
            time.sleep(3)

    print("\n" + "=" * 60)
    print(f"Re-extraction complete!")
    print(f"  Success: {success}")
    print(f"  Failed: {failed}")
    print(f"  Total new leads: {total_leads}")

if __name__ == "__main__":
    import urllib.parse
    re_extract_all()
