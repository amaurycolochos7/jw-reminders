"""
Phase 3: Data Enrichment.
- Finds business emails via Hunter.io API (optional)
- Generates WhatsApp direct message links
- Formats phone numbers for Mexican businesses
"""
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Lead
from config import settings


async def enrich_leads(session: AsyncSession) -> dict:
    """
    Enrich all 'qualified' leads with:
    - WhatsApp links (from phone numbers)
    - Email discovery via Hunter.io (if API key configured)
    """
    result = await session.execute(
        select(Lead).where(Lead.status == "qualified")
    )
    leads = result.scalars().all()

    enriched_count = 0
    emails_found = 0
    whatsapp_generated = 0

    for lead in leads:
        # --- WhatsApp Link ---
        if lead.phone and not lead.whatsapp_link:
            link = generate_whatsapp_link(lead.phone)
            if link:
                lead.whatsapp_link = link
                whatsapp_generated += 1

        # --- Email Discovery via Hunter.io ---
        if settings.has_hunter and not lead.email:
            # Try to find email using business domain or name
            domain = extract_domain(lead.website) if lead.website else None
            email = await find_email_hunter(lead.name, domain)
            if email:
                lead.email = email
                emails_found += 1

        lead.status = "enriched"
        enriched_count += 1

    await session.commit()

    return {
        "total_enriched": enriched_count,
        "emails_found": emails_found,
        "whatsapp_links_generated": whatsapp_generated,
        "hunter_enabled": settings.has_hunter
    }


def generate_whatsapp_link(phone: str) -> str | None:
    """
    Convert a phone number to a WhatsApp direct link.
    Handles Mexican phone formats:
    - +52 XXX XXX XXXX
    - 52XXXXXXXXXX
    - XXXXXXXXXX (10 digits, assumes Mexico)
    """
    if not phone:
        return None

    # Clean the number
    clean = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "").replace(".", "")

    # Remove leading country code if present
    if clean.startswith("521"):
        clean = "52" + clean[3:]  # Remove the '1' after '52'
    elif clean.startswith("52"):
        pass  # Already in correct format
    elif len(clean) == 10 and clean[0] in "123456789":
        clean = "52" + clean  # Add Mexico country code
    elif len(clean) < 10:
        return None  # Too short to be valid

    return f"https://wa.me/{clean}"


def generate_whatsapp_message(business_name: str) -> str:
    """Generate a pre-written WhatsApp message for cold outreach."""
    return (
        f"Hola, equipo de {business_name} 👋\n\n"
        f"Vi que tienen excelente reputación en Google Maps pero noté que no cuentan con "
        f"una página web propia para recibir más clientes.\n\n"
        f"Me dedico a crear sitios web profesionales y los puedo tener listos en pocos días. "
        f"¿Les interesaría ver cómo se vería su negocio digitalizado?\n\n"
        f"Quedo atento 🙌"
    )


def extract_domain(url: str) -> str | None:
    """Extract domain from URL."""
    if not url:
        return None
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path
        domain = domain.replace("www.", "")
        return domain if domain else None
    except Exception:
        return None


async def find_email_hunter(company_name: str, domain: str = None) -> str | None:
    """
    Use Hunter.io API to find email for a business.
    Tries domain search first, then falls back to company name search.
    """
    if not settings.has_hunter:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try domain search first (more accurate)
            if domain:
                resp = await client.get(
                    "https://api.hunter.io/v2/domain-search",
                    params={
                        "domain": domain,
                        "api_key": settings.HUNTER_API_KEY,
                        "limit": 1
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    emails = data.get("data", {}).get("emails", [])
                    if emails:
                        return emails[0].get("value")

            # Fallback: search by company name
            resp = await client.get(
                "https://api.hunter.io/v2/domain-search",
                params={
                    "company": company_name,
                    "api_key": settings.HUNTER_API_KEY,
                    "limit": 1
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                emails = data.get("data", {}).get("emails", [])
                if emails:
                    return emails[0].get("value")

    except Exception:
        pass

    return None
