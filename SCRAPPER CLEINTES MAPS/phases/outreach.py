"""
Phase 4: Outreach Automation.
Uses OpenAI GPT-4o to generate ultra-personalized cold emails
and WhatsApp messages based on the business's Google reviews.
"""
import json
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Lead, OutreachLog
from config import settings


async def generate_outreach(session: AsyncSession, lead_id: int = None) -> dict:
    """
    Generate personalized outreach messages for enriched leads.
    If lead_id is provided, generates for that specific lead only.
    """
    if not settings.has_openai:
        return {"error": "OPENAI_API_KEY not configured. Add it to your .env file."}

    if lead_id:
        result = await session.execute(
            select(Lead).where(Lead.id == lead_id)
        )
        leads = [result.scalar_one_or_none()]
        if not leads[0]:
            return {"error": f"Lead {lead_id} not found"}
    else:
        result = await session.execute(
            select(Lead).where(Lead.status == "enriched")
        )
        leads = result.scalars().all()

    if not leads:
        return {"total_generated": 0, "message": "No enriched leads to process."}

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    generated_count = 0
    errors = 0

    for lead in leads:
        try:
            # Parse reviews for personalization
            reviews = []
            if lead.reviews_text:
                try:
                    reviews = json.loads(lead.reviews_text)
                except json.JSONDecodeError:
                    reviews = []

            reviews_context = ""
            if reviews:
                reviews_context = "\n".join([
                    f"- {r.get('author', 'Cliente')}: \"{r.get('text', '')[:200]}\""
                    for r in reviews[:3]
                    if r.get('text')
                ])

            # --- Generate Email ---
            email_prompt = f"""Genera un correo electrónico de prospección en español para el siguiente negocio.
El correo debe ser corto (máximo 5 oraciones), directo, y personalizado.

NEGOCIO:
- Nombre: {lead.name}
- Categoría: {lead.category or 'No especificada'}
- Calificación: {lead.rating}/5 con {lead.total_reviews} reseñas
- Ubicación: {lead.address or lead.city or 'No especificada'}
- Tiene página web: {'No' if not lead.has_real_website else 'Sí, pero básica'}

RESEÑAS DESTACADAS:
{reviews_context or 'No disponibles'}

REGLAS:
1. La primera línea DEBE hacer referencia a algo específico del negocio (una reseña, su categoría, su reputación).
2. NO uses frases genéricas como "Estimado señor/señora" o "Me permito presentarme".
3. El pitch: Ofreces crear un sistema web profesional (página web, catálogo digital, o sistema de gestión) en pocos días.
4. Incluye un CTA directo: ofrece mostrar un demo personalizado esta semana.
5. Tono: profesional pero casual y directo. Como un mensaje entre colegas.
6. NO pongas asunto del email, solo el cuerpo.
7. Firma como "El equipo de [Tu Marca]" (deja el placeholder).

Genera SOLO el cuerpo del correo, sin explicaciones adicionales."""

            email_response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "user", "content": email_prompt}],
                max_tokens=500,
                temperature=0.8
            )
            generated_email = email_response.choices[0].message.content.strip()

            # --- Generate WhatsApp Message ---
            wa_prompt = f"""Genera un mensaje corto de WhatsApp en español para prospectar al negocio "{lead.name}".

CONTEXTO:
- Tienen {lead.total_reviews} reseñas con {lead.rating}/5 estrellas en Google
- Su categoría es: {lead.category or 'negocio local'}
- No tienen página web propia

REGLAS:
1. Máximo 3 oraciones.
2. Usa emojis moderadamente (máximo 2).
3. Menciona algo específico del negocio.
4. Ofrece mostrar un demo de cómo se vería su negocio digitalizado.
5. Tono casual y amigable.

Genera SOLO el mensaje, sin explicaciones."""

            wa_response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "user", "content": wa_prompt}],
                max_tokens=200,
                temperature=0.8
            )
            generated_wa = wa_response.choices[0].message.content.strip()

            # Save to lead
            lead.generated_email = generated_email
            lead.generated_whatsapp_msg = generated_wa
            lead.status = "outreach_ready"

            # Create outreach logs
            session.add(OutreachLog(
                lead_id=lead.id,
                channel="email",
                message_content=generated_email,
                status="generated"
            ))
            session.add(OutreachLog(
                lead_id=lead.id,
                channel="whatsapp",
                message_content=generated_wa,
                status="generated"
            ))

            generated_count += 1

        except Exception as e:
            errors += 1
            print(f"Error generating outreach for {lead.name}: {e}")

    await session.commit()

    return {
        "total_generated": generated_count,
        "errors": errors,
        "total_leads_processed": len(leads)
    }


async def generate_outreach_manual(lead: Lead) -> dict:
    """
    Generate outreach WITHOUT OpenAI (template-based fallback).
    For users who don't have an OpenAI API key.
    """
    # Template-based email
    reviews_mention = ""
    if lead.reviews_text:
        try:
            reviews = json.loads(lead.reviews_text)
            if reviews and reviews[0].get("text"):
                reviews_mention = f'Vi que sus clientes los recomiendan mucho — "{reviews[0]["text"][:80]}..."'
        except Exception:
            pass

    if not reviews_mention:
        reviews_mention = f"Vi que tienen una calificación de {lead.rating}/5 con {lead.total_reviews} reseñas en Google"

    email = f"""Hola equipo de {lead.name},

{reviews_mention}. Es claro que ofrecen un gran servicio.

Noté que no cuentan con una página web propia para capitalizar toda esa buena reputación. Me dedico a crear sistemas web profesionales y puedo tener uno listo para {lead.name} en pocos días.

¿Les gustaría ver un demo personalizado de cómo se vería su negocio digitalizado? Puedo mostrárselos esta misma semana.

Saludos,
[Tu Marca]"""

    wa_msg = (
        f"Hola {{name}} 👋 buen día, disculpa la molestia.\n\n"
        f"Soy Jahaziel, diseñador web. Vi su negocio en Google Maps y me llamó la atención que no tienen página web.\n\n"
        f"Le hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n"
        f"¿Le interesa que le muestre cómo se vería?"
    ).replace("{{name}}", lead.name.split()[0] if lead.name else "Amigo")

    lead.generated_email = email
    lead.generated_whatsapp_msg = wa_msg
    lead.status = "outreach_ready"

    return {
        "email": email,
        "whatsapp": wa_msg
    }
