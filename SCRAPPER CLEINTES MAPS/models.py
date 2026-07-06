"""
SQLAlchemy models for the Lead Pipeline database.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean
from database import Base


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    place_id = Column(String, unique=True, nullable=True, index=True)

    # --- Basic Info ---
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True)
    category = Column(String, nullable=True)
    categories = Column(Text, nullable=True)  # JSON array as string

    # --- Contact ---
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    email = Column(String, nullable=True)  # Found via enrichment

    # --- Google Maps Data ---
    rating = Column(Float, nullable=True)
    total_reviews = Column(Integer, default=0)
    reviews_text = Column(Text, nullable=True)  # Top 3 reviews as JSON
    google_maps_url = Column(String, nullable=True)
    image_url = Column(String, nullable=True)

    # --- Enrichment ---
    whatsapp_link = Column(String, nullable=True)
    has_real_website = Column(Boolean, default=False)

    # --- Pipeline Status ---
    # new -> qualified -> enriched -> outreach_ready -> contacted
    status = Column(String, default="new", index=True)

    # --- Outreach ---
    generated_email = Column(Text, nullable=True)
    generated_whatsapp_msg = Column(Text, nullable=True)
    contacted_at = Column(DateTime, nullable=True)

    # --- Metadata ---
    search_keyword = Column(String, nullable=True)
    search_location = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class Search(Base):
    __tablename__ = "searches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    keyword = Column(String, nullable=False)
    location = Column(String, nullable=False)
    total_results = Column(Integer, default=0)
    apify_run_id = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending, running, completed, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class OutreachLog(Base):
    __tablename__ = "outreach_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    channel = Column(String, nullable=False)  # email, whatsapp
    message_content = Column(Text, nullable=True)
    status = Column(String, default="generated")  # generated, sent, replied, bounced
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
