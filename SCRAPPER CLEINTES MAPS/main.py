"""
Lead Pipeline — Main Application Entry Point.
FastAPI server that serves the API and static dashboard.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import init_db
from api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    print("✅ Database initialized")
    print("🚀 Lead Pipeline is running at http://localhost:8000")
    yield


app = FastAPI(
    title="Lead Pipeline B2B",
    description="Pipeline de generación de leads B2B con Apify + OpenAI",
    version="1.0.0",
    lifespan=lifespan
)

# Include API routes
app.include_router(router)

# Serve static files (dashboard)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Serve the dashboard."""
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

