import sqlite3

conn = sqlite3.connect('leads.db')
c = conn.cursor()

# Check existing locations
c.execute("SELECT DISTINCT search_location, COUNT(*) as cnt FROM leads GROUP BY search_location ORDER BY cnt DESC")
locs = c.fetchall()
print("Existing locations:")
for l in locs:
    print(f"  {l[0] or '-':<40} | {l[1]} leads")

print()
c.execute("SELECT COUNT(*) FROM leads")
print(f"Total leads: {c.fetchone()[0]}")

conn.close()
