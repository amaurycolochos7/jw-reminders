"""
Configuration management for the Lead Pipeline.
Loads environment variables and provides typed access to settings.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # --- API Keys ---
    APIFY_API_TOKEN: str = os.getenv("APIFY_API_TOKEN", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    HUNTER_API_KEY: str = os.getenv("HUNTER_API_KEY", "")

    # --- Database ---
    DATABASE_URL: str = "sqlite+aiosqlite:///./leads.db"

    # --- Apify ---
    APIFY_ACTOR_ID: str = "compass~crawler-google-places"
    APIFY_MAX_RESULTS: int = 200  # Max results per search

    # --- Qualification Filters (defaults) ---
    MIN_REVIEWS: int = 50
    MIN_RATING: float = 4.0
    # Domains that indicate "no real website"
    NO_WEBSITE_DOMAINS: list = [
        "facebook.com", "instagram.com", "linktr.ee",
        "linktree.com", "twitter.com", "x.com",
        "tiktok.com", "youtube.com"
    ]

    # --- OpenAI ---
    OPENAI_MODEL: str = "gpt-4o"

    @property
    def has_apify(self) -> bool:
        return bool(self.APIFY_API_TOKEN)

    @property
    def has_openai(self) -> bool:
        return bool(self.OPENAI_API_KEY)

    @property
    def has_hunter(self) -> bool:
        return bool(self.HUNTER_API_KEY)


settings = Settings()
