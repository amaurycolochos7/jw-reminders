"""
Phase 1: Lead Extraction using Apify Google Maps Scraper.
Connects to the Apify API, runs the Google Maps Scraper actor,
and stores results in the database.
"""
import json
import asyncio
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config import settings
from models import Lead, Search

APIFY_BASE = "https://api.apify.com/v2"


async def start_extraction(
    session: AsyncSession,
    keyword: str,
    location: str,
    max_results: int = 200
) -> dict:
    """
    Start an Apify Google Maps Scraper run and wait for results.
    Returns a summary dict with total found and saved counts.
    """
    if not settings.has_apify:
        return {"error": "APIFY_API_TOKEN not configured. Add it to your .env file."}

    # Create search record
    search = Search(keyword=keyword, location=location, status="running")
    session.add(search)
    await session.commit()

    search_term = f"{keyword} en {location}"

    # Detect if location is US-based
    us_indicators = ['texas','california','florida','new york','illinois','arizona','nevada','colorado',
                     'georgia','ohio','michigan','pennsylvania','houston','dallas','los angeles','chicago',
                     'phoenix','miami','atlanta','denver','seattle','portland','las vegas','usa','united states']
    is_us = any(s in location.lower() for s in us_indicators)

    # Apify actor input for Google Maps Scraper
    # Docs: https://apify.com/compass/crawler-google-places
    # Key: use locationQuery separately (not inside searchStringsArray) for better coverage
    actor_input = {
        "searchStringsArray": [keyword],
        "locationQuery": f"{location}, {'United States' if is_us else 'Mexico'}",
        "maxCrawledPlacesPerSearch": max_results,
        "language": "es" if not is_us else "en",
        "countryCode": "us" if is_us else "mx",
        "deeperCityScrape": True,
        "reviewsSort": "newest",
        "reviewsTranslation": "originalAndTranslated",
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Start the actor run and wait for it to finish
            url = f"{APIFY_BASE}/acts/{settings.APIFY_ACTOR_ID}/run-sync-get-dataset-items"
            params = {"token": settings.APIFY_API_TOKEN}

            response = await client.post(
                url,
                params=params,
                json=actor_input,
                timeout=300.0
            )

            if response.status_code != 200 and response.status_code != 201:
                search.status = "failed"
                await session.commit()
                error_detail = response.text[:800] if response.text else "No details"
                return {
                    "error": f"Apify API error: {response.status_code}",
                    "details": error_detail
                }

            results = response.json()

    except httpx.TimeoutException:
        search.status = "failed"
        await session.commit()
        return {"error": "Apify request timed out. The search may still be running on Apify."}
    except Exception as e:
        search.status = "failed"
        await session.commit()
        return {"error": f"Request failed: {str(e)}"}

    # Process and save results
    saved_count = 0
    skipped_count = 0

    for item in results:
        place_id = item.get("placeId", item.get("cid", ""))

        # Check for duplicates
        if place_id:
            existing = await session.execute(
                select(Lead).where(Lead.place_id == place_id)
            )
            if existing.scalar_one_or_none():
                skipped_count += 1
                continue

        # Extract top reviews
        reviews = item.get("reviews", [])
        top_reviews = []
        for r in reviews[:3]:
            top_reviews.append({
                "text": r.get("text", r.get("textTranslated", "")),
                "stars": r.get("stars", 0),
                "author": r.get("name", "Anónimo")
            })

        # Parse categories
        categories_raw = item.get("categories", [])
        category = item.get("categoryName", categories_raw[0] if categories_raw else None)

        # Determine if website is a "real" website
        website = item.get("website", None)
        has_real_website = False
        if website:
            has_real_website = not any(
                domain in website.lower()
                for domain in settings.NO_WEBSITE_DOMAINS
            )

        # Format phone for WhatsApp if available
        phone = item.get("phone", None)
        whatsapp_link = None
        if phone:
            clean_phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "")
            if clean_phone.startswith("52"):
                whatsapp_link = f"https://wa.me/{clean_phone}"
            elif len(clean_phone) == 10:
                whatsapp_link = f"https://wa.me/52{clean_phone}"

        lead = Lead(
            place_id=place_id or None,
            name=item.get("title", item.get("name", "Sin nombre")),
            address=item.get("address", item.get("street", None)),
            city=item.get("city", None),
            state=item.get("state", None),
            country=item.get("countryCode", None),
            category=category,
            categories=json.dumps(categories_raw) if categories_raw else None,
            phone=phone,
            website=website,
            rating=item.get("totalScore", item.get("rating", None)),
            total_reviews=item.get("reviewsCount", item.get("totalReviews", 0)),
            reviews_text=json.dumps(top_reviews, ensure_ascii=False) if top_reviews else None,
            google_maps_url=item.get("url", item.get("googleMapsUrl", None)),
            image_url=item.get("imageUrl", None),
            has_real_website=has_real_website,
            whatsapp_link=whatsapp_link,
            status="new",
            search_keyword=keyword,
            search_location=location,
        )
        session.add(lead)
        saved_count += 1

    # Update search record
    search.total_results = saved_count
    search.status = "completed"
    await session.commit()

    return {
        "search_id": search.id,
        "keyword": keyword,
        "location": location,
        "total_from_apify": len(results),
        "saved": saved_count,
        "skipped_duplicates": skipped_count
    }


async def import_from_json(session: AsyncSession, file_path: str) -> dict:
    """
    Import leads from a previously downloaded Apify JSON file.
    Useful if you already ran the scraper from the Apify console.
    """
    import aiofiles

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"error": f"Could not read file: {str(e)}"}

    if not isinstance(data, list):
        return {"error": "JSON file must contain an array of place objects."}

    saved = 0
    skipped = 0

    for item in data:
        place_id = item.get("placeId", item.get("cid", ""))

        if place_id:
            existing = await session.execute(
                select(Lead).where(Lead.place_id == place_id)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

        reviews = item.get("reviews", [])
        top_reviews = []
        for r in reviews[:3]:
            top_reviews.append({
                "text": r.get("text", r.get("textTranslated", "")),
                "stars": r.get("stars", 0),
                "author": r.get("name", "Anónimo")
            })

        categories_raw = item.get("categories", [])
        category = item.get("categoryName", categories_raw[0] if categories_raw else None)

        website = item.get("website", None)
        has_real_website = False
        if website:
            has_real_website = not any(
                domain in website.lower()
                for domain in settings.NO_WEBSITE_DOMAINS
            )

        phone = item.get("phone", None)
        whatsapp_link = None
        if phone:
            clean_phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "")
            if clean_phone.startswith("52"):
                whatsapp_link = f"https://wa.me/{clean_phone}"
            elif len(clean_phone) == 10:
                whatsapp_link = f"https://wa.me/52{clean_phone}"

        lead = Lead(
            place_id=place_id or None,
            name=item.get("title", item.get("name", "Sin nombre")),
            address=item.get("address", item.get("street", None)),
            city=item.get("city", None),
            state=item.get("state", None),
            country=item.get("countryCode", None),
            category=category,
            categories=json.dumps(categories_raw) if categories_raw else None,
            phone=phone,
            website=website,
            rating=item.get("totalScore", item.get("rating", None)),
            total_reviews=item.get("reviewsCount", item.get("totalReviews", 0)),
            reviews_text=json.dumps(top_reviews, ensure_ascii=False) if top_reviews else None,
            google_maps_url=item.get("url", item.get("googleMapsUrl", None)),
            image_url=item.get("imageUrl", None),
            has_real_website=has_real_website,
            whatsapp_link=whatsapp_link,
            status="new",
            search_keyword="imported",
            search_location="imported",
        )
        session.add(lead)
        saved += 1

    await session.commit()
    return {"saved": saved, "skipped_duplicates": skipped, "total_in_file": len(data)}
