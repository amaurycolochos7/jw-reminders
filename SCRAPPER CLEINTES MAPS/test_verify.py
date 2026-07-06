import urllib.request, json, sqlite3

conn = sqlite3.connect('leads.db')
c = conn.cursor()
# Get leads from the same category the user tested
c.execute("""
    SELECT id, name, phone, search_keyword, search_location
    FROM leads 
    WHERE search_keyword = 'restaurantes' AND phone IS NOT NULL AND phone != ''
    LIMIT 10
""")
leads = c.fetchall()
conn.close()

print(f"Found {len(leads)} restaurant leads with phone:")
for l in leads:
    print(f"  id={l[0]}, name={l[1]}, phone={l[2]}, kw={l[3]}, loc={l[4]}")

# Test verify
phones = [{"phone": l[2], "name": l[1], "id": l[0]} for l in leads]
payload = json.dumps({"phones": phones}).encode()
req = urllib.request.Request('http://localhost:3001/verify-numbers', data=payload, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=60)
data = json.loads(resp.read().decode())

print(f"\nValid: {len(data.get('valid', []))}")
print(f"Invalid: {len(data.get('invalid', []))}")
for v in data.get('invalid', []):
    print(f"  INVALID: {v.get('name')} - {v.get('phone')} - reason: {v.get('reason')}")
