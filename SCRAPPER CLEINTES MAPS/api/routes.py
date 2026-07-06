"""
REST API routes for the Lead Pipeline.
"""
import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete, update, case
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Lead, Search, OutreachLog
from phases.extractor import start_extraction, import_from_json
from phases.qualifier import qualify_leads, requalify_all, get_qualification_stats
from phases.enricher import enrich_leads, generate_whatsapp_message
from phases.outreach import generate_outreach, generate_outreach_manual

router = APIRouter(prefix="/api")


# ─────────────────────────────────────────────
# APIFY TOKEN MANAGEMENT
# ─────────────────────────────────────────────
@router.get("/apify-token")
async def get_apify_token():
    """Get current Apify API token (masked)."""
    from config import settings
    token = settings.APIFY_API_TOKEN
    if not token:
        return {"token": "", "masked": "", "configured": False}
    masked = token[:12] + "..." + token[-4:] if len(token) > 16 else token[:4] + "..."
    return {"token": token, "masked": masked, "configured": True}


@router.post("/apify-token")
async def set_apify_token(token: str):
    """Update Apify API token at runtime and persist to .env."""
    from config import settings
    import os

    # Update runtime
    settings.APIFY_API_TOKEN = token
    os.environ["APIFY_API_TOKEN"] = token

    # Persist to .env
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    try:
        lines = []
        found = False
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()
        for i, line in enumerate(lines):
            if line.startswith("APIFY_API_TOKEN="):
                lines[i] = f"APIFY_API_TOKEN={token}\n"
                found = True
        if not found:
            lines.append(f"APIFY_API_TOKEN={token}\n")
        with open(env_path, "w") as f:
            f.writelines(lines)
    except Exception as e:
        pass  # Still works at runtime even if .env write fails

    masked = token[:12] + "..." + token[-4:] if len(token) > 16 else token[:4] + "..."
    return {"success": True, "masked": masked}


# ─────────────────────────────────────────────
# PHASE 1: EXTRACTION
# ─────────────────────────────────────────────
@router.post("/extract")
async def api_extract(
    keyword: str,
    location: str,
    max_results: int = 200,
    session: AsyncSession = Depends(get_session)
):
    """Start an extraction from Apify Google Maps Scraper."""
    result = await start_extraction(session, keyword, location, max_results)
    return result


@router.post("/import")
async def api_import_json(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session)
):
    """Import leads from a JSON file (downloaded from Apify console)."""
    content = await file.read()
    # Save temp file
    import tempfile, os
    tmp_path = os.path.join(tempfile.gettempdir(), "apify_import.json")
    with open(tmp_path, "wb") as f:
        f.write(content)
    result = await import_from_json(session, tmp_path)
    os.remove(tmp_path)
    return result


# ─────────────────────────────────────────────
# PHASE 2: QUALIFICATION
# ─────────────────────────────────────────────
@router.post("/qualify")
async def api_qualify(
    min_reviews: int = Query(default=50),
    min_rating: float = Query(default=4.0),
    session: AsyncSession = Depends(get_session)
):
    """Run qualification filters on new leads."""
    return await qualify_leads(session, min_reviews, min_rating)


@router.post("/requalify")
async def api_requalify(
    min_reviews: int = Query(default=50),
    min_rating: float = Query(default=4.0),
    session: AsyncSession = Depends(get_session)
):
    """Reset and re-run qualification with new parameters."""
    return await requalify_all(session, min_reviews, min_rating)


# ─────────────────────────────────────────────
# PHASE 3: ENRICHMENT
# ─────────────────────────────────────────────
@router.post("/enrich")
async def api_enrich(session: AsyncSession = Depends(get_session)):
    """Enrich qualified leads with WhatsApp links and emails."""
    return await enrich_leads(session)


# ─────────────────────────────────────────────
# PHASE 4: OUTREACH
# ─────────────────────────────────────────────
@router.post("/outreach")
async def api_generate_outreach(
    use_ai: bool = Query(default=True),
    session: AsyncSession = Depends(get_session)
):
    """Generate personalized outreach messages."""
    if use_ai:
        return await generate_outreach(session)
    else:
        # Template-based fallback
        result = await session.execute(
            select(Lead).where(Lead.status == "enriched")
        )
        leads = result.scalars().all()
        count = 0
        for lead in leads:
            await generate_outreach_manual(lead)
            count += 1
        await session.commit()
        return {"total_generated": count, "method": "template"}


@router.post("/outreach/{lead_id}")
async def api_generate_outreach_single(
    lead_id: int,
    use_ai: bool = Query(default=True),
    session: AsyncSession = Depends(get_session)
):
    """Generate outreach for a single lead."""
    if use_ai:
        return await generate_outreach(session, lead_id)
    else:
        result = await session.execute(select(Lead).where(Lead.id == lead_id))
        lead = result.scalar_one_or_none()
        if not lead:
            return {"error": "Lead not found"}
        msgs = await generate_outreach_manual(lead)
        await session.commit()
        return {"lead_id": lead_id, **msgs}


# ─────────────────────────────────────────────
# LEADS CRUD
# ─────────────────────────────────────────────
@router.get("/leads")
async def api_list_leads(
    status: str = Query(default=None),
    search: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session)
):
    """List leads with optional filters and pagination."""
    query = select(Lead)

    if status:
        query = query.where(Lead.status == status)
    if search:
        query = query.where(Lead.name.ilike(f"%{search}%"))

    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar()

    # Paginate
    query = query.order_by(Lead.total_reviews.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await session.execute(query)
    leads = result.scalars().all()

    return {
        "leads": [lead_to_dict(l) for l in leads],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }


@router.get("/leads/by-keyword")
async def api_leads_by_keyword(
    keyword: str,
    location: str = Query(default=None),
    has_website: str = Query(default=None),
    exclude_status: str = Query(default=None),
    filter_status: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session)
):
    """Get leads filtered by search keyword."""
    query = select(Lead).where(Lead.search_keyword == keyword)
    if location:
        query = query.where(Lead.search_location == location)
    if has_website == "yes":
        query = query.where(Lead.has_real_website == True)
    elif has_website == "no":
        query = query.where(Lead.has_real_website == False)
    if exclude_status:
        query = query.where(Lead.status != exclude_status)
    if filter_status:
        query = query.where(Lead.status == filter_status)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar()

    query = query.order_by(Lead.total_reviews.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await session.execute(query)
    leads = result.scalars().all()

    return {
        "leads": [lead_to_dict(l) for l in leads],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }


@router.get("/leads/{lead_id}")
async def api_get_lead(lead_id: int, session: AsyncSession = Depends(get_session)):
    """Get detailed info for a single lead."""
    result = await session.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        return {"error": "Lead not found"}
    return lead_to_dict(lead)


@router.delete("/leads/{lead_id}")
async def api_delete_lead(lead_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a lead."""
    await session.execute(delete(Lead).where(Lead.id == lead_id))
    await session.commit()
    return {"deleted": lead_id}


@router.patch("/leads/{lead_id}/status")
async def api_update_status(
    lead_id: int,
    status: str,
    session: AsyncSession = Depends(get_session)
):
    """Update a lead's status."""
    await session.execute(
        update(Lead).where(Lead.id == lead_id).values(status=status)
    )
    await session.commit()
    return {"lead_id": lead_id, "new_status": status}


# ─────────────────────────────────────────────
# STATS & EXPORT
# ─────────────────────────────────────────────
@router.get("/stats")
async def api_stats(session: AsyncSession = Depends(get_session)):
    """Get pipeline statistics."""
    return await get_qualification_stats(session)


@router.get("/searches")
async def api_searches(session: AsyncSession = Depends(get_session)):
    """List all search history."""
    result = await session.execute(select(Search).order_by(Search.created_at.desc()))
    searches = result.scalars().all()
    return [{
        "id": s.id,
        "keyword": s.keyword,
        "location": s.location,
        "total_results": s.total_results,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None
    } for s in searches]


@router.get("/export/csv")
async def api_export_csv(
    status: str = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """Export leads as a CSV file."""
    query = select(Lead)
    if status:
        query = query.where(Lead.status == status)
    query = query.order_by(Lead.total_reviews.desc())

    result = await session.execute(query)
    leads = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Nombre", "Categoría", "Dirección", "Ciudad", "Teléfono",
        "Website", "Rating", "Reseñas", "Email", "WhatsApp Link",
        "Status", "Email Generado", "Mensaje WhatsApp", "Google Maps URL"
    ])

    for lead in leads:
        writer.writerow([
            lead.name, lead.category, lead.address, lead.city, lead.phone,
            lead.website, lead.rating, lead.total_reviews, lead.email,
            lead.whatsapp_link, lead.status, lead.generated_email,
            lead.generated_whatsapp_msg, lead.google_maps_url
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )


# ─────────────────────────────────────────────
# PIPELINE (Run all phases sequentially)
# ─────────────────────────────────────────────
@router.post("/pipeline/run-all")
async def api_run_pipeline(
    min_reviews: int = Query(default=50),
    min_rating: float = Query(default=4.0),
    use_ai: bool = Query(default=False),
    session: AsyncSession = Depends(get_session)
):
    """Run phases 2, 3, and 4 sequentially on existing leads."""
    results = {}

    # Phase 2
    results["qualification"] = await qualify_leads(session, min_reviews, min_rating)

    # Phase 3
    results["enrichment"] = await enrich_leads(session)

    # Phase 4
    if use_ai:
        results["outreach"] = await generate_outreach(session)
    else:
        r = await session.execute(select(Lead).where(Lead.status == "enriched"))
        leads = r.scalars().all()
        count = 0
        for lead in leads:
            await generate_outreach_manual(lead)
            count += 1
        await session.commit()
        results["outreach"] = {"total_generated": count, "method": "template"}

    return results


# ─────────────────────────────────────────────
# CLEANUP & MANAGEMENT
# ─────────────────────────────────────────────
@router.get("/categories")
async def api_categories(session: AsyncSession = Depends(get_session)):
    """Get all unique search keywords with counts and stats."""
    result = await session.execute(
        select(
            Lead.search_keyword,
            Lead.search_location,
        )
        .group_by(Lead.search_keyword, Lead.search_location)
    )
    groups = result.all()

    categories = []
    for keyword, location in groups:
        q = select(Lead).where(Lead.search_keyword == keyword)
        if location:
            q = q.where(Lead.search_location == location)

        all_leads_result = await session.execute(q)
        all_leads = all_leads_result.scalars().all()

        total = len(all_leads)
        with_web = sum(1 for l in all_leads if l.has_real_website)
        without_web = total - with_web
        contacted = sum(1 for l in all_leads if l.status == 'contacted')
        pending = total - contacted
        with_phone = sum(1 for l in all_leads if l.phone and l.status != 'contacted')
        ratings = [l.rating for l in all_leads if l.rating]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0

        categories.append({
            "keyword": keyword,
            "location": location,
            "total": total,
            "with_website": with_web,
            "without_website": without_web,
            "contacted": contacted,
            "pending": pending,
            "with_phone": with_phone,
            "avg_rating": avg_rating,
        })

    categories.sort(key=lambda x: x["total"], reverse=True)
    return categories


@router.post("/leads/bulk-contacted")
async def api_bulk_mark_contacted(
    lead_ids: list[int],
    session: AsyncSession = Depends(get_session)
):
    """Mark multiple leads as contacted in a single call."""
    now = datetime.now(timezone.utc)
    await session.execute(
        update(Lead)
        .where(Lead.id.in_(lead_ids))
        .values(status='contacted', contacted_at=now)
    )
    await session.commit()
    return {"updated": len(lead_ids)}


@router.post("/clean-category")
async def api_clean_category(
    keyword: str,
    location: str = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """Delete all leads with a real website in a category.
    Returns the count deleted and remaining leads with phone."""
    # Step 1: Delete leads with website
    del_q = delete(Lead).where(
        Lead.search_keyword == keyword,
        Lead.has_real_website == True,
        Lead.status != 'contacted'
    )
    if location:
        del_q = del_q.where(Lead.search_location == location)
    del_result = await session.execute(del_q)
    await session.commit()

    # Step 2: Count remaining leads with phone (not contacted)
    remaining_q = select(func.count()).select_from(Lead).where(
        Lead.search_keyword == keyword,
        Lead.status != 'contacted',
        Lead.phone.isnot(None),
        Lead.phone != ''
    )
    if location:
        remaining_q = remaining_q.where(Lead.search_location == location)
    remaining = (await session.execute(remaining_q)).scalar()

    return {
        "deleted_with_web": del_result.rowcount,
        "remaining_with_phone": remaining
    }


@router.delete("/bulk/with-website")
async def api_bulk_delete_with_website(
    keyword: str = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """Delete all leads that have a real website. Optionally filter by keyword."""
    query = delete(Lead).where(Lead.has_real_website == True)
    if keyword:
        query = query.where(Lead.search_keyword == keyword)

    result = await session.execute(query)
    await session.commit()
    return {"deleted": result.rowcount, "filter": keyword or "all"}


@router.delete("/bulk/by-keyword")
async def api_bulk_delete_by_keyword(
    keyword: str,
    location: str = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """Delete all leads from a specific search keyword."""
    query = delete(Lead).where(Lead.search_keyword == keyword)
    if location:
        query = query.where(Lead.search_location == location)
    result = await session.execute(query)
    await session.commit()
    return {"deleted": result.rowcount, "keyword": keyword, "location": location}


@router.delete("/bulk/all")
async def api_bulk_delete_all(session: AsyncSession = Depends(get_session)):
    """Delete ALL leads. Use with caution."""
    result = await session.execute(delete(Lead))
    await session.execute(delete(Search))
    await session.execute(delete(OutreachLog))
    await session.commit()
    return {"deleted": result.rowcount, "message": "All data purged"}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def lead_to_dict(lead: Lead) -> dict:
    """Convert a Lead model to a dictionary."""
    reviews = []
    if lead.reviews_text:
        try:
            reviews = json.loads(lead.reviews_text)
        except Exception:
            pass

    return {
        "id": lead.id,
        "name": lead.name,
        "category": lead.category,
        "address": lead.address,
        "city": lead.city,
        "state": lead.state,
        "phone": lead.phone,
        "website": lead.website,
        "has_real_website": lead.has_real_website,
        "email": lead.email,
        "rating": lead.rating,
        "total_reviews": lead.total_reviews,
        "reviews": reviews,
        "google_maps_url": lead.google_maps_url,
        "image_url": lead.image_url,
        "whatsapp_link": lead.whatsapp_link,
        "status": lead.status,
        "generated_email": lead.generated_email,
        "generated_whatsapp_msg": lead.generated_whatsapp_msg,
        "search_keyword": lead.search_keyword,
        "search_location": lead.search_location,
        "contacted_at": lead.contacted_at.isoformat() if lead.contacted_at else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }
