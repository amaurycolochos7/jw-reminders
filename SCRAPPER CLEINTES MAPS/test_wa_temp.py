import urllib.request, json

# Check WA status
try:
    data = json.loads(urllib.request.urlopen('http://localhost:3001/status').read())
    print(f"WA Status: {json.dumps(data, indent=2)}")
except Exception as e:
    print(f"Status error: {e}")

# Try verify with clean numbers
try:
    payload = json.dumps({"numbers": ["522222488888", "523313849039"]}).encode()
    req = urllib.request.Request('http://localhost:3001/verify-numbers', data=payload, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    print(f"\nVerify result: {resp.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"\nVerify error {e.code}: {e.read().decode()}")
except Exception as e:
    print(f"\nVerify error: {e}")
