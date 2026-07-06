"""
Phase 2: Lead Qualification.
Filters raw leads to identify businesses that are "ready to buy":
- No real website (or using social media as website)
- High review count (active business with real revenue)
- Good rating (cares about reputation)
"""
from sqlalchemy import select, update, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from models import Lead
from config import settings


async def qualify_leads(
    session: AsyncSession,
    min_reviews: int = None,
    min_rating: float = None,
) -> dict:
    """
    Apply qualification filters to all 'new' leads.
    Marks passing leads as 'qualified' and failing ones as 'disqualified'.
    Returns stats about the qualification run.
    """
    min_reviews = min_reviews or settings.MIN_REVIEWS
    min_rating = min_rating or settings.MIN_RATING

    # Get all new leads
    result = await session.execute(
        select(Lead).where(Lead.status == "new")
    )
    new_leads = result.scalars().all()

    qualified_count = 0
    disqualified_count = 0
    disqualified_reasons = {
        "has_website": 0,
        "low_reviews": 0,
        "low_rating": 0,
    }

    for lead in new_leads:
        reasons = []

        # Filter 1: Must NOT have a real website
        if lead.has_real_website:
            reasons.append("has_website")
            disqualified_reasons["has_website"] += 1

        # Filter 2: Must have minimum reviews (shows real traction)
        if (lead.total_reviews or 0) < min_reviews:
            reasons.append("low_reviews")
            disqualified_reasons["low_reviews"] += 1

        # Filter 3: Must have minimum rating (cares about service)
        if (lead.rating or 0) < min_rating:
            reasons.append("low_rating")
            disqualified_reasons["low_rating"] += 1

        if not reasons:
            lead.status = "qualified"
            qualified_count += 1
        else:
            lead.status = "disqualified"
            disqualified_count += 1

    await session.commit()

    total = qualified_count + disqualified_count
    rate = (qualified_count / total * 100) if total > 0 else 0

    return {
        "total_processed": total,
        "qualified": qualified_count,
        "disqualified": disqualified_count,
        "qualification_rate": f"{rate:.1f}%",
        "filters_applied": {
            "min_reviews": min_reviews,
            "min_rating": min_rating,
            "no_real_website": True
        },
        "disqualification_reasons": disqualified_reasons
    }


async def requalify_all(
    session: AsyncSession,
    min_reviews: int = None,
    min_rating: float = None,
) -> dict:
    """
    Reset all leads to 'new' and re-run qualification.
    Useful when changing filter parameters.
    """
    # Reset all non-contacted leads back to 'new'
    await session.execute(
        update(Lead)
        .where(Lead.status.in_(["qualified", "disqualified", "enriched", "outreach_ready"]))
        .values(status="new")
    )
    await session.commit()

    return await qualify_leads(session, min_reviews, min_rating)


async def get_qualification_stats(session: AsyncSession) -> dict:
    """Get current pipeline stats by status."""
    result = await session.execute(
        select(Lead.status, func.count(Lead.id)).group_by(Lead.status)
    )
    stats = {row[0]: row[1] for row in result.all()}

    total = sum(stats.values())
    return {
        "total_leads": total,
        "by_status": stats,
        "qualified_rate": f"{(stats.get('qualified', 0) / total * 100):.1f}%" if total > 0 else "0%"
    }
