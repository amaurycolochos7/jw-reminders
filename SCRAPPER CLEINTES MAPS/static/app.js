/* ═══════════════════════════════════════════
   Lead Pipeline B2B — Dashboard JavaScript
   ═══════════════════════════════════════════ */

const API = '/api';
let currentPage = 1;
let searchTimeout = null;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadRecentLeads();
    loadSearchHistory();
    setupNavigation();
    setupFileDrop();
});

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem) navItem.classList.add('active');

    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${viewName}`);
    if (view) view.classList.add('active');

    // Load data for the view
    if (viewName === 'dashboard') {
        loadStats();
        loadRecentLeads();
    } else if (viewName === 'leads') {
        loadLeads();
    } else if (viewName === 'extract') {
        loadSearchHistory();
        loadApifyToken();
    } else if (viewName === 'gestion') {
        loadCategories();
    } else if (viewName === 'whatsapp') {
        checkWAStatus();
        loadWALeadCount();
    }
}

// ── Apify Token Management ──
async function loadApifyToken() {
    try {
        const data = await apiGet('/apify-token');
        const input = document.getElementById('apify-token');
        const status = document.getElementById('token-status');
        if (data.configured) {
            input.value = data.token;
            status.textContent = `✅ Token activo: ${data.masked}`;
            status.style.color = 'var(--green)';
        } else {
            status.textContent = '⚠️ Sin token configurado';
            status.style.color = 'var(--orange)';
        }
    } catch (e) {
        document.getElementById('token-status').textContent = '❌ Error al cargar token';
    }
}

async function saveApifyToken() {
    const token = document.getElementById('apify-token').value.trim();
    if (!token) { alert('Pega una API key primero'); return; }
    if (!token.startsWith('apify_api_')) { alert('El token debe empezar con apify_api_'); return; }

    try {
        const res = await apiPost(`/apify-token?token=${encodeURIComponent(token)}`);
        const status = document.getElementById('token-status');
        status.textContent = `✅ Token guardado: ${res.masked}`;
        status.style.color = 'var(--green)';
        alert('✅ API Key actualizada correctamente');
    } catch (e) {
        alert('Error al guardar token');
    }
}

function toggleTokenVisibility() {
    const input = document.getElementById('apify-token');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────
async function apiGet(path) {
    const res = await fetch(`${API}${path}`);
    return res.json();
}

async function apiPost(path, body = null) {
    const options = { method: 'POST' };
    if (body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, options);
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(`${API}${path}`, { method: 'DELETE' });
    return res.json();
}

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────
async function loadStats() {
    try {
        const data = await apiGet('/stats');
        const stats = data.by_status || {};
        document.getElementById('stat-total').textContent = data.total_leads || 0;
        document.getElementById('stat-qualified').textContent =
            (stats.qualified || 0) + (stats.enriched || 0) + (stats.outreach_ready || 0);
        document.getElementById('stat-outreach').textContent = stats.outreach_ready || 0;
        document.getElementById('stat-rate').textContent = data.qualified_rate || '0%';
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

// ─────────────────────────────────────────────
// RECENT LEADS (Dashboard)
// ─────────────────────────────────────────────
async function loadRecentLeads() {
    try {
        const data = await apiGet('/leads?per_page=10');
        const tbody = document.getElementById('recent-leads-body');
        if (!data.leads || data.leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay leads aún. ¡Empieza una extracción!</td></tr>';
            return;
        }
        tbody.innerHTML = data.leads.map(lead => `
            <tr>
                <td><span class="lead-name" onclick="showLeadDetail(${lead.id})">${esc(lead.name)}</span></td>
                <td class="text-muted">${esc(lead.category || '—')}</td>
                <td>${renderRating(lead.rating)}</td>
                <td>${lead.total_reviews || 0}</td>
                <td>${renderBadge(lead.status)}</td>
                <td>${renderActions(lead)}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Error:', e);
    }
}

// ─────────────────────────────────────────────
// ALL LEADS
// ─────────────────────────────────────────────
async function loadLeads(page = 1) {
    currentPage = page;
    const status = document.getElementById('leads-filter')?.value || '';
    const search = document.getElementById('leads-search')?.value || '';
    let url = `/leads?page=${page}&per_page=50`;
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    try {
        const data = await apiGet(url);
        const tbody = document.getElementById('leads-table-body');

        if (!data.leads || data.leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No se encontraron leads</td></tr>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.leads.map(lead => `
            <tr>
                <td><span class="lead-name" onclick="showLeadDetail(${lead.id})">${esc(lead.name)}</span></td>
                <td class="text-muted">${esc(lead.category || '—')}</td>
                <td>${renderRating(lead.rating)}</td>
                <td>${lead.total_reviews || 0}</td>
                <td class="text-muted">${esc(lead.phone || '—')}</td>
                <td class="text-muted">${lead.has_real_website ? '✅ Sí' : '❌ No'}</td>
                <td>${renderBadge(lead.status)}</td>
                <td>${renderActions(lead)}</td>
            </tr>
        `).join('');

        // Pagination
        renderPagination(data.page, data.total_pages);
    } catch (e) {
        console.error('Error:', e);
    }
}

function renderPagination(current, total) {
    const container = document.getElementById('pagination');
    if (total <= 1) { container.innerHTML = ''; return; }

    let html = '';
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);

    if (current > 1) html += `<button class="page-btn" onclick="loadLeads(${current - 1})">&laquo;</button>`;
    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadLeads(${i})">${i}</button>`;
    }
    if (current < total) html += `<button class="page-btn" onclick="loadLeads(${current + 1})">&raquo;</button>`;

    container.innerHTML = html;
}

function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadLeads(1), 400);
}

// ─────────────────────────────────────────────
// SEARCH HISTORY
// ─────────────────────────────────────────────
async function loadSearchHistory() {
    try {
        const data = await apiGet('/searches');
        const tbody = document.getElementById('search-history-body');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin búsquedas aún</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(s => `
            <tr>
                <td>${esc(s.keyword)}</td>
                <td>${esc(s.location)}</td>
                <td>${s.total_results}</td>
                <td>${renderBadge(s.status)}</td>
                <td class="text-muted">${s.created_at ? new Date(s.created_at).toLocaleString('es-MX') : '—'}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Error:', e);
    }
}

// ─────────────────────────────────────────────
// PHASE 1: EXTRACTION
// ─────────────────────────────────────────────
async function startExtraction() {
    const keyword = document.getElementById('extract-keyword').value.trim();
    const location = document.getElementById('extract-location').value.trim();
    const max = document.getElementById('extract-max').value || 100;

    if (!keyword || !location) {
        showResult('extract-result', 'Por favor ingresa keyword y ubicación.', true);
        return;
    }

    showLoading(true);
    try {
        const data = await apiPost(`/extract?keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&max_results=${max}`);
        if (data.error) {
            showResult('extract-result', `Error: ${data.error}${data.details ? '\n\nDetalles: ' + data.details : ''}`, true);
        } else {
            showResult('extract-result',
                `✅ Extracción completada!\n` +
                `📊 Resultados de Apify: ${data.total_from_apify}\n` +
                `💾 Guardados: ${data.saved}\n` +
                `🔄 Duplicados saltados: ${data.skipped_duplicates}`
            );
            loadStats();
            loadSearchHistory();
        }
    } catch (e) {
        showResult('extract-result', `Error de conexión: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// IMPORT JSON
// ─────────────────────────────────────────────
function setupFileDrop() {
    const drop = document.getElementById('file-drop');
    if (!drop) return;

    drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) {
            document.getElementById('import-file').files = files;
        }
    });
}

async function importJSON() {
    const fileInput = document.getElementById('import-file');
    if (!fileInput.files.length) {
        showResult('import-result', 'Selecciona un archivo JSON primero.', true);
        return;
    }

    showLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        const res = await fetch(`${API}/import`, { method: 'POST', body: formData });
        const data = await res.json();

        if (data.error) {
            showResult('import-result', `Error: ${data.error}`, true);
        } else {
            showResult('import-result',
                `✅ Importación completada!\n` +
                `📄 Total en archivo: ${data.total_in_file}\n` +
                `💾 Guardados: ${data.saved}\n` +
                `🔄 Duplicados saltados: ${data.skipped_duplicates}`
            );
            loadStats();
        }
    } catch (e) {
        showResult('import-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// PHASE 2: QUALIFY
// ─────────────────────────────────────────────
async function runQualify() {
    const reviews = document.getElementById('qualify-reviews').value || 50;
    const rating = document.getElementById('qualify-rating').value || 4.0;

    showLoading(true);
    try {
        const data = await apiPost(`/qualify?min_reviews=${reviews}&min_rating=${rating}`);
        showResult('qualify-result',
            `✅ Calificación completada!\n` +
            `📊 Procesados: ${data.total_processed}\n` +
            `✅ Calificados: ${data.qualified}\n` +
            `❌ Descalificados: ${data.disqualified}\n` +
            `📈 Tasa: ${data.qualification_rate}\n\n` +
            `Razones de descalificación:\n` +
            `  - Tiene website: ${data.disqualification_reasons?.has_website || 0}\n` +
            `  - Pocas reseñas: ${data.disqualification_reasons?.low_reviews || 0}\n` +
            `  - Rating bajo: ${data.disqualification_reasons?.low_rating || 0}`
        );
        loadStats();
    } catch (e) {
        showResult('qualify-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

async function runRequalify() {
    const reviews = document.getElementById('qualify-reviews').value || 50;
    const rating = document.getElementById('qualify-rating').value || 4.0;

    showLoading(true);
    try {
        const data = await apiPost(`/requalify?min_reviews=${reviews}&min_rating=${rating}`);
        showResult('qualify-result', `✅ Re-calificación completada!\nCalificados: ${data.qualified} | Descalificados: ${data.disqualified}`);
        loadStats();
    } catch (e) {
        showResult('qualify-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// PHASE 3: ENRICH
// ─────────────────────────────────────────────
async function runEnrich() {
    showLoading(true);
    try {
        const data = await apiPost('/enrich');
        showResult('enrich-result',
            `✅ Enriquecimiento completado!\n` +
            `📊 Enriquecidos: ${data.total_enriched}\n` +
            `📧 Emails encontrados: ${data.emails_found}\n` +
            `📱 WhatsApp links: ${data.whatsapp_links_generated}\n` +
            `🔑 Hunter.io: ${data.hunter_enabled ? 'Activo' : 'No configurado'}`
        );
        loadStats();
    } catch (e) {
        showResult('enrich-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// PHASE 4: OUTREACH
// ─────────────────────────────────────────────
async function runOutreach(useAI = true) {
    showLoading(true);
    try {
        const data = await apiPost(`/outreach?use_ai=${useAI}`);
        if (data.error) {
            showResult('outreach-result', `Error: ${data.error}`, true);
        } else {
            showResult('outreach-result',
                `✅ Outreach generado!\n` +
                `📧 Mensajes generados: ${data.total_generated}\n` +
                `⚠️ Errores: ${data.errors || 0}\n` +
                `📝 Método: ${useAI ? 'OpenAI GPT-4o' : 'Templates'}`
            );
            loadStats();
        }
    } catch (e) {
        showResult('outreach-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// FULL PIPELINE
// ─────────────────────────────────────────────
async function runFullPipeline() {
    const reviews = document.getElementById('qualify-reviews')?.value || 50;
    const rating = document.getElementById('qualify-rating')?.value || 4.0;

    showLoading(true);
    try {
        const data = await apiPost(`/pipeline/run-all?min_reviews=${reviews}&min_rating=${rating}&use_ai=false`);
        let text = '✅ Pipeline completo ejecutado!\n\n';
        if (data.qualification) {
            text += `📋 CALIFICACIÓN:\n  Calificados: ${data.qualification.qualified} | Descalificados: ${data.qualification.disqualified}\n\n`;
        }
        if (data.enrichment) {
            text += `🔍 ENRIQUECIMIENTO:\n  Enriquecidos: ${data.enrichment.total_enriched} | WhatsApp: ${data.enrichment.whatsapp_links_generated}\n\n`;
        }
        if (data.outreach) {
            text += `📧 OUTREACH:\n  Generados: ${data.outreach.total_generated}\n`;
        }
        showResult('pipeline-result', text);
        loadStats();
    } catch (e) {
        showResult('pipeline-result', `Error: ${e.message}`, true);
    }
    showLoading(false);
}

// ─────────────────────────────────────────────
// LEAD DETAIL MODAL
// ─────────────────────────────────────────────
async function showLeadDetail(id) {
    try {
        const lead = await apiGet(`/leads/${id}`);
        if (lead.error) return;

        document.getElementById('modal-title').textContent = lead.name;

        let reviewsHtml = '';
        if (lead.reviews && lead.reviews.length > 0) {
            reviewsHtml = lead.reviews.map(r => `
                <div class="review-item">
                    <div class="review-author">${esc(r.author)} — ${'⭐'.repeat(r.stars || 0)}</div>
                    <div>${esc(r.text || 'Sin texto')}</div>
                </div>
            `).join('');
        } else {
            reviewsHtml = '<p class="text-muted">Sin reseñas disponibles</p>';
        }

        let outreachHtml = '';
        if (lead.generated_email) {
            outreachHtml += `
                <div class="modal-section">
                    <h4>Email Generado</h4>
                    <div class="outreach-preview">${esc(lead.generated_email)}</div>
                    <button class="btn btn-sm btn-secondary" onclick="copyText(\`${esc(lead.generated_email).replace(/`/g, '\\`')}\`)">Copiar Email</button>
                </div>
            `;
        }
        if (lead.generated_whatsapp_msg) {
            outreachHtml += `
                <div class="modal-section">
                    <h4>Mensaje WhatsApp</h4>
                    <div class="outreach-preview">${esc(lead.generated_whatsapp_msg)}</div>
                    ${lead.whatsapp_link ?
                    `<a href="${lead.whatsapp_link}?text=${encodeURIComponent(lead.generated_whatsapp_msg)}" target="_blank" class="btn btn-sm btn-wa">Abrir WhatsApp</a>` :
                    ''
                }
                </div>
            `;
        }

        document.getElementById('modal-body').innerHTML = `
            <div class="modal-section">
                <h4>Información General</h4>
                <div class="modal-field"><span class="modal-field-label">Categoría</span><span class="modal-field-value">${esc(lead.category || '—')}</span></div>
                <div class="modal-field"><span class="modal-field-label">Dirección</span><span class="modal-field-value">${esc(lead.address || '—')}</span></div>
                <div class="modal-field"><span class="modal-field-label">Ciudad</span><span class="modal-field-value">${esc(lead.city || '—')}</span></div>
                <div class="modal-field"><span class="modal-field-label">Teléfono</span><span class="modal-field-value">${esc(lead.phone || '—')}</span></div>
                <div class="modal-field"><span class="modal-field-label">Website</span><span class="modal-field-value">${lead.website ? `<a href="${lead.website}" target="_blank" style="color:var(--blue)">${esc(lead.website)}</a>` : '❌ Sin website'}</span></div>
                <div class="modal-field"><span class="modal-field-label">Rating</span><span class="modal-field-value">${renderRating(lead.rating)} (${lead.total_reviews} reseñas)</span></div>
                <div class="modal-field"><span class="modal-field-label">Status</span><span class="modal-field-value">${renderBadge(lead.status)}</span></div>
            </div>

            <div class="modal-section">
                <h4>Contacto Rápido</h4>
                ${lead.whatsapp_link ?
                `<a href="${lead.whatsapp_link}" target="_blank" class="btn btn-sm btn-wa" style="margin-right:8px">WhatsApp Directo</a>` :
                '<span class="text-muted">Sin WhatsApp</span>'
            }
                ${lead.email ? `<span style="margin-left:8px">📧 ${esc(lead.email)}</span>` : ''}
                ${lead.google_maps_url ? `<a href="${lead.google_maps_url}" target="_blank" class="btn btn-sm btn-ghost" style="margin-left:8px">Ver en Google Maps</a>` : ''}
            </div>

            <div class="modal-section">
                <h4>Reseñas Destacadas</h4>
                ${reviewsHtml}
            </div>

            ${outreachHtml}

            <div class="modal-section" style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
                <button class="btn btn-sm btn-primary" onclick="generateSingleOutreach(${lead.id}, true)">Generar Email con IA</button>
                <button class="btn btn-sm btn-secondary" onclick="generateSingleOutreach(${lead.id}, false)">Generar con Template</button>
                <button class="btn btn-sm btn-ghost danger" onclick="deleteLead(${lead.id})" style="margin-left:auto">Eliminar</button>
            </div>
        `;

        document.getElementById('modal-overlay').classList.add('active');
    } catch (e) {
        console.error('Error loading lead:', e);
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

async function generateSingleOutreach(id, useAI) {
    showLoading(true);
    try {
        await apiPost(`/outreach/${id}?use_ai=${useAI}`);
        await showLeadDetail(id); // Refresh modal
        loadStats();
    } catch (e) {
        alert('Error: ' + e.message);
    }
    showLoading(false);
}

async function deleteLead(id) {
    if (!confirm('¿Eliminar este lead?')) return;
    try {
        await apiDelete(`/leads/${id}`);
        closeModal();
        loadLeads(currentPage);
        loadRecentLeads();
        loadStats();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
function exportCSV() {
    const status = document.getElementById('leads-filter')?.value || '';
    let url = `${API}/export/csv`;
    if (status) url += `?status=${status}`;
    window.open(url, '_blank');
}

// ─────────────────────────────────────────────
// RENDERERS
// ─────────────────────────────────────────────
function renderRating(rating) {
    if (!rating) return '<span class="text-muted">—</span>';
    return `<span class="rating">
        <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ${rating.toFixed(1)}
    </span>`;
}

function renderBadge(status) {
    const labels = {
        new: 'Nuevo',
        qualified: 'Calificado',
        disqualified: 'Descalificado',
        enriched: 'Enriquecido',
        outreach_ready: 'Outreach Listo',
        contacted: 'Contactado',
        pending: 'Pendiente',
        running: 'Ejecutando',
        completed: 'Completado',
        failed: 'Fallido'
    };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function renderActions(lead) {
    let html = '';
    if (lead.whatsapp_link) {
        html += `<a href="${lead.whatsapp_link}" target="_blank" title="WhatsApp" class="btn-icon" style="color:#25D366">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.604-1.47A11.96 11.96 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.16 0-4.16-.7-5.79-1.885l-.403-.295-2.732.872.87-2.633-.32-.42A9.72 9.72 0 0 1 2.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12s-4.365 9.75-9.75 9.75z"/></svg>
        </a>`;
    }
    html += `<button class="btn-icon" onclick="showLeadDetail(${lead.id})" title="Ver detalle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>`;
    return html;
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showResult(elementId, text, isError = false) {
    const el = document.getElementById(elementId);
    el.textContent = text;
    el.className = `result-box ${isError ? 'error' : 'success'}`;
    el.classList.remove('hidden');
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Copiado al portapapeles!');
    });
}

// ─────────────────────────────────────────────
// GESTIÓN VIEW — Redesigned v2
// ─────────────────────────────────────────────
let selectedCategory = null;
let categoryPage = 1;
let contactedPage = 1;
let isSending = false;
let isAnalyzing = false;
let verifiedLeads = null;
let waCatPolling = null;

async function loadCategories() {
    try {
        const data = await apiGet('/categories');
        const pendingEl = document.getElementById('pending-categories');
        const sentEl = document.getElementById('sent-categories');

        if (!data || data.length === 0) {
            pendingEl.innerHTML = '<div class="g-cat-empty">No hay categorías aún. Extrae leads primero.</div>';
            sentEl.innerHTML = '<div class="g-cat-empty">Sin categorías contactadas</div>';
            document.getElementById('pending-section-count').textContent = '0';
            document.getElementById('sent-section-count').textContent = '0';
            return;
        }

        const pending = data.filter(c => c.pending > 0);
        const sent = data.filter(c => c.pending === 0 && c.contacted > 0);

        document.getElementById('pending-section-count').textContent = pending.length;
        document.getElementById('sent-section-count').textContent = sent.length;

        pendingEl.innerHTML = pending.length === 0
            ? '<div class="g-cat-empty">Todas las categorías han sido contactadas 🎉</div>'
            : pending.map(c => renderCatItem(c, false)).join('');

        sentEl.innerHTML = sent.length === 0
            ? '<div class="g-cat-empty">Sin categorías contactadas</div>'
            : sent.map(c => renderCatItem(c, true)).join('');

        checkGestionWAStatus();
    } catch (e) {
        console.error('Error loading categories:', e);
    }
}

function renderCatItem(cat, isSent) {
    const isActive = selectedCategory &&
        selectedCategory.keyword === cat.keyword &&
        selectedCategory.location === cat.location;

    return `
        <div class="g-cat-item ${isActive ? 'active' : ''} ${isSent ? 'sent' : ''}"
             onclick="selectCategory('${esc(cat.keyword)}', '${esc(cat.location || '')}')">
            <div class="g-cat-top">
                <span class="g-cat-name" title="${esc(cat.keyword)}">${esc(cat.keyword)}</span>
                <span class="g-cat-count">${cat.total}</span>
            </div>
            <div class="g-cat-bottom">
                <span>📍 ${esc(cat.location || '—')}</span>
                ${isSent
            ? '<span class="g-cat-sent-tag">✅ Enviado</span>'
            : `<span class="g-cat-stat"><span class="green">${cat.with_phone}</span> con tel</span>`
        }
            </div>
        </div>
    `;
}

function toggleSection(header) {
    const list = header.nextElementSibling;
    list.classList.toggle('collapsed');
    header.querySelector('.g-chevron')?.classList.toggle('rotated');
}

function selectCategory(keyword, location) {
    selectedCategory = { keyword, location };
    categoryPage = 1;
    contactedPage = 1;
    verifiedLeads = null;

    loadCategories();

    document.getElementById('gestion-empty').classList.add('hidden');
    document.getElementById('category-detail').classList.remove('hidden');

    document.getElementById('cat-detail-title').textContent = keyword;
    document.getElementById('cat-detail-subtitle').textContent = `📍 ${location || 'Sin ubicación'}`;

    // Reset panels
    document.getElementById('analyze-progress').classList.add('hidden');
    document.getElementById('g-composer').classList.add('hidden');
    document.getElementById('send-progress').classList.add('hidden');
    document.getElementById('g-action-panel').classList.remove('hidden');

    // Reset button
    const btn = document.getElementById('btn-analyze');
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Analizar y Limpiar WhatsApp';
    document.getElementById('analyze-hint').textContent = 'Verifica cuáles tienen WhatsApp, elimina los que no y deja solo los válidos.';

    // Auto-populate message (single unified message)
    document.getElementById('wa-compose-msg').value = generateFullMessage(keyword, selectedCategory.location);

    updateCategoryStats();
    switchGestionTab('pending');
}

// ── Generate full WhatsApp message per category (single message) ──
function generateFullMessage(keyword, location) {
    const kw = keyword.toLowerCase();
    const loc = (location || '').toLowerCase();
    const usIndicators = ['texas','california','florida','new york','illinois','arizona','nevada','colorado','georgia','north carolina','ohio','michigan','pennsylvania','new jersey','virginia','washington','massachusetts','tennessee','indiana','maryland','minnesota','wisconsin','missouri','oregon','oklahoma','connecticut','utah','iowa','arkansas','kansas','nebraska','new mexico','hawaii','idaho','alabama','louisiana','south carolina','kentucky','mississippi','houston','dallas','san antonio','austin','los angeles','chicago','phoenix','san diego','san jose','miami','tampa','orlando','atlanta','denver','seattle','portland','las vegas','charlotte','nashville','boston','detroit','minneapolis','sacramento','san francisco','el paso','fort worth','tucson','albuquerque','raleigh','memphis','baltimore','louisville','new orleans','salt lake','jacksonville','indianapolis','columbus','philadelphia','pittsburgh','cleveland','cincinnati','st. louis','st louis','usa','united states'];
    const isUS = usIndicators.some(s => loc.includes(s));

    if (isUS) {
        return `Hi {{name}} 👋 just a quick question, are you the owner or manager?\n\nI'm Jahaziel, a web designer. I found your business on Google Maps and noticed you don't have a website yet.\n\nHere's my offer: I'll design your website mockup for free. If you like it, we can talk. If not, no strings attached 🤝\n\nWould you like me to show you how it would look?`;
    }

    const templates = {
        'salones de belleza': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su salón en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'clínicas dentales': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su clínica en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'gimnasios': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su gimnasio en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'restaurant': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su restaurante en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'taller mecánico': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su taller en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'lavanderías': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su lavandería en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'clínicas': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su clínica en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'consultorios': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su consultorio en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'empresas de renta': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su empresa en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'despachos jurídicos': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su despacho en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
        'academias': `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su academia en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`,
    };

    for (const [key, msg] of Object.entries(templates)) {
        if (kw.includes(key) || key.includes(kw.split(',')[0].trim())) {
            return msg;
        }
    }

    return `Hola {{name}} 👋 buen día, disculpa la molestia.\n\nSoy Jahaziel, diseñador web. Vi su negocio en Google Maps y me llamó la atención que no tienen página web.\n\nLe hago una propuesta sin compromiso: le diseño su página gratis. Si le gusta, platicamos costos. Si no, no pasa nada 🤝\n\n¿Le interesa que le muestre cómo se vería?`;
}

async function updateCategoryStats() {
    if (!selectedCategory) return;
    try {
        const data = await apiGet('/categories');
        const cat = data.find(c =>
            c.keyword === selectedCategory.keyword &&
            (c.location || '') === (selectedCategory.location || '')
        );
        if (cat) {
            document.getElementById('stat-pending-count').textContent = cat.pending;
            document.getElementById('stat-phone-count').textContent = cat.with_phone;
            document.getElementById('stat-contacted-count').textContent = cat.contacted;
            document.getElementById('tab-pending-count').textContent = cat.pending;
            document.getElementById('tab-contacted-count').textContent = cat.contacted;
        }
    } catch (e) { /* ignore */ }
}

// ── BULK: Analyze and Clean ALL Categories ──
async function analyzeAllCategories() {
    if (isAnalyzing || isSending) { alert('Ya hay un proceso en curso'); return; }

    const cats = await apiGet('/categories');
    const pending = cats.filter(c => c.pending > 0);
    if (!pending.length) { alert('No hay categorias pendientes'); return; }
    if (!confirm('Analizar y limpiar ' + pending.length + ' categorias?\n\nEsto elimina negocios con website y de baja calidad.')) return;

    isAnalyzing = true;
    document.getElementById('btn-analyze-all').disabled = true;
    document.getElementById('btn-send-all').disabled = true;
    document.getElementById('btn-analyze-all').innerHTML = '<div class="spinner-sm"></div> Analizando...';

    const prog = document.getElementById('bulk-progress');
    const title = document.getElementById('bulk-progress-title');
    const counter = document.getElementById('bulk-progress-counter');
    const bar = document.getElementById('bulk-progress-bar');
    const log = document.getElementById('bulk-log');
    prog.classList.remove('hidden');
    title.textContent = 'Analizando todas las categorias...';
    log.innerHTML = '';
    bar.style.width = '0%';

    let totReady = 0, totD = 0;
    for (let i = 0; i < pending.length; i++) {
        const cat = pending[i];
        bar.style.width = Math.round(i/pending.length*100) + '%';
        counter.textContent = (i+1) + '/' + pending.length;
        log.innerHTML += '<div class="log-info">' + cat.keyword + ' (' + (cat.location||'-') + ')...</div>';
        log.scrollTop = log.scrollHeight;
        try {
            // Step 1: Clean (remove with website)
            let cUrl = '/clean-category?keyword=' + encodeURIComponent(cat.keyword);
            if (cat.location) cUrl += '&location=' + encodeURIComponent(cat.location);
            const cr = await apiPost(cUrl);
            let del = cr.deleted_with_web || 0;

            // Step 2: Get remaining leads with phone
            let allL = [], pg = 1, tp = 1;
            while (pg <= tp) {
                let u = '/leads/by-keyword?keyword=' + encodeURIComponent(cat.keyword) + '&page=' + pg + '&per_page=200&has_website=no&exclude_status=contacted';
                if (cat.location) u += '&location=' + encodeURIComponent(cat.location);
                const d = await apiGet(u);
                tp = d.total_pages;
                allL = allL.concat(d.leads.filter(l => l.phone));
                pg++;
            }

            // Step 3: Filter low quality
            const lq = allL.filter(l => (l.rating && l.rating < 3.5) || (l.total_reviews !== undefined && l.total_reviews < 5));
            allL = allL.filter(l => !(l.rating && l.rating < 3.5) && !(l.total_reviews !== undefined && l.total_reviews < 5));
            for (const l of lq) { try { await apiDelete('/leads/' + l.id); del++; } catch(e){} }

            // Step 4: WhatsApp Verification
            if (allL.length > 0) {
                try {
                    const resStatus = await fetch(`${WA_API}/status`);
                    const st = await resStatus.json();
                    if (st.status === 'ready') {
                        const contacts = allL.map(l => ({ phone: l.phone, name: l.name, id: l.id }));
                        const verifyRes = await fetch(`${WA_API}/verify-numbers`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phones: contacts })
                        });
                        const verifyData = await verifyRes.json();
                        
                        if (verifyData.invalid && verifyData.invalid.length > 0) {
                            for (const inv of verifyData.invalid) {
                                try { await apiDelete(`/leads/${inv.id}`); del++; } catch(e){}
                            }
                        }
                        
                        if (verifyData.valid) {
                            const validIds = verifyData.valid.map(v => v.id);
                            allL = allL.filter(l => validIds.includes(l.id));
                        }
                    } else {
                        log.innerHTML += '<div class="log-warn">' + cat.keyword + ': WA no conectado, omitiendo verificación</div>';
                    }
                } catch(e) {}
            }

            totReady += allL.length;
            totD += del;
            log.innerHTML += '<div class="log-ok">' + cat.keyword + ': ' + allL.length + ' listos, ' + del + ' eliminados</div>';
        } catch(e) {
            log.innerHTML += '<div class="log-err">' + cat.keyword + ': Error - ' + e.message + '</div>';
        }
        log.scrollTop = log.scrollHeight;
    }
    bar.style.width = '100%';
    counter.textContent = pending.length + '/' + pending.length;
    title.textContent = 'Analisis completo: ' + totReady + ' leads listos, ' + totD + ' eliminados';
    isAnalyzing = false;
    document.getElementById('btn-analyze-all').disabled = false;
    document.getElementById('btn-analyze-all').innerHTML = 'Analizar y Limpiar Todo';
    document.getElementById('btn-send-all').disabled = false;
    loadCategories();
}

// ── BULK: Send WhatsApp to ALL Categories ──
async function sendAllCategories() {
    if (isAnalyzing || isSending) { alert('Ya hay un proceso en curso'); return; }
    try {
        const s = await (await fetch(WA_API+'/status')).json();
        if (s.status !== 'ready') { alert('WhatsApp no conectado.'); return; }
    } catch(e) { alert('Servidor WhatsApp no corriendo (3001).'); return; }

    const cats = await apiGet('/categories');
    const pending = cats.filter(c => c.pending > 0 && c.with_phone > 0);
    if (!pending.length) { alert('No hay categorias pendientes con telefono'); return; }

    let totalL = 0;
    for (const c of pending) totalL += c.with_phone;
    if (!confirm('Enviar WhatsApp a ' + pending.length + ' categorias (~' + totalL + ' leads)?')) return;

    isSending = true;
    document.getElementById('btn-analyze-all').disabled = true;
    document.getElementById('btn-send-all').disabled = true;
    document.getElementById('btn-send-all').innerHTML = '<div class="spinner-sm"></div> Enviando...';

    const prog = document.getElementById('bulk-progress');
    const title = document.getElementById('bulk-progress-title');
    const counter = document.getElementById('bulk-progress-counter');
    const bar = document.getElementById('bulk-progress-bar');
    const log = document.getElementById('bulk-log');
    prog.classList.remove('hidden');
    title.textContent = 'Enviando WhatsApp a todas las categorias...';
    log.innerHTML = '';
    bar.style.width = '0%';

    let totS = 0, totF = 0;
    for (let i = 0; i < pending.length; i++) {
        const cat = pending[i];
        bar.style.width = Math.round(i/pending.length*100) + '%';
        counter.textContent = (i+1) + '/' + pending.length;
        log.innerHTML += '<div class="log-info">Enviando a ' + cat.keyword + ' (' + (cat.location||'-') + ')...</div>';
        log.scrollTop = log.scrollHeight;
        try {
            let leads = [], pg = 1, tp = 1;
            while (pg <= tp) {
                let u = '/leads/by-keyword?keyword=' + encodeURIComponent(cat.keyword) + '&page=' + pg + '&per_page=200&exclude_status=contacted';
                if (cat.location) u += '&location=' + encodeURIComponent(cat.location);
                const d = await apiGet(u);
                tp = d.total_pages;
                leads = leads.concat(d.leads.filter(l => l.phone));
                pg++;
            }
            if (!leads.length) {
                log.innerHTML += '<div class="log-warn">' + cat.keyword + ': Sin leads con telefono</div>';
                continue;
            }

            const usIndicators = ['texas','california','florida','new york','illinois','arizona','nevada','colorado','georgia','north carolina','ohio','michigan','pennsylvania','new jersey','virginia','washington','massachusetts','tennessee','indiana','maryland','minnesota','wisconsin','missouri','oregon','oklahoma','connecticut','utah','iowa','arkansas','kansas','nebraska','new mexico','hawaii','idaho','alabama','louisiana','south carolina','kentucky','mississippi','houston','dallas','san antonio','austin','los angeles','chicago','phoenix','san diego','san jose','miami','tampa','orlando','atlanta','denver','seattle','portland','las vegas','charlotte','nashville','boston','detroit','minneapolis','sacramento','san francisco','el paso','fort worth','tucson','albuquerque','raleigh','memphis','baltimore','louisville','new orleans','salt lake','jacksonville','indianapolis','columbus','philadelphia','pittsburgh','cleveland','cincinnati','st. louis','st louis','usa','united states'];
            const loc = (cat.location || '').toLowerCase();
            const isUS = usIndicators.some(s => loc.includes(s));

            const msg = generateFullMessage(cat.keyword, cat.location);
            const contacts = leads.map(l => {
                let ph = l.phone.replace(/[\s\-\(\)\+]/g, '');
                // session_manager.js now handles the default prefix based on isUS
                return { phone: ph, name: l.name || 'Estimado/a' };
            });

            const sRes = await fetch(WA_API + '/send-bulk', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ contacts: contacts, message: msg, delayMs: 8000, isUS: isUS })
            });
            const sData = await sRes.json();

            // Poll for completion
            let done = false;
            while (!done) {
                await new Promise(r => setTimeout(r, 3000));
                try {
                    const st = await (await fetch(WA_API + '/bulk-status')).json();
                    if (!st.running) {
                        done = true;
                        totS += st.sent || 0;
                        totF += st.failed || 0;
                        log.innerHTML += '<div class="log-ok">' + cat.keyword + ': ' + st.sent + ' enviados, ' + st.failed + ' fallidos</div>';
                        const ids = leads.map(l => l.id);
                        await fetch('/api/leads/bulk-contacted', {
                            method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify(ids)
                        });
                    }
                } catch(e) { done = true; log.innerHTML += '<div class="log-err">' + cat.keyword + ': Error de status</div>'; }
            }
        } catch(e) {
            log.innerHTML += '<div class="log-err">' + cat.keyword + ': ' + e.message + '</div>';
            totF++;
        }
        log.scrollTop = log.scrollHeight;
    }
    bar.style.width = '100%';
    counter.textContent = pending.length + '/' + pending.length;
    title.textContent = 'Envio completo: ' + totS + ' enviados, ' + totF + ' fallidos';
    isSending = false;
    document.getElementById('btn-analyze-all').disabled = false;
    document.getElementById('btn-send-all').disabled = false;
    document.getElementById('btn-analyze-all').innerHTML = 'Analizar y Limpiar Todo';
    document.getElementById('btn-send-all').innerHTML = 'Enviar WhatsApp a Todos';
    loadCategories();
}

// ── ANALYZE & CLEAN: The single main action ──
async function analyzeCategory() {
    if (!selectedCategory || isAnalyzing || isSending) return;

    isAnalyzing = true;
    const btn = document.getElementById('btn-analyze');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-sm"></div> Analizando...';

    const progressEl = document.getElementById('analyze-progress');
    const stepsEl = document.getElementById('analyze-steps');
    const barEl = document.getElementById('analyze-bar');
    progressEl.classList.remove('hidden');

    try {
        // STEP 1: Delete leads with website
        stepsEl.innerHTML = '<div class="g-step active">🗑️ Eliminando negocios con website...</div>';
        barEl.style.width = '20%';

        let cleanUrl = `/clean-category?keyword=${encodeURIComponent(selectedCategory.keyword)}`;
        if (selectedCategory.location) cleanUrl += `&location=${encodeURIComponent(selectedCategory.location)}`;
        const cleanResult = await apiPost(cleanUrl);

        stepsEl.innerHTML = `<div class="g-step done">✅ ${cleanResult.deleted_with_web} con website eliminados</div>`;
        barEl.style.width = '40%';

        // STEP 2: Get all remaining leads with phone
        stepsEl.innerHTML += '<div class="g-step active">📱 Obteniendo leads con teléfono...</div>';

        let allLeads = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            let url = `/leads/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}&page=${page}&per_page=200&has_website=no&exclude_status=contacted`;
            if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;
            const data = await apiGet(url);
            totalPages = data.total_pages;
            allLeads = allLeads.concat(data.leads.filter(l => l.phone));
            page++;
        }

        stepsEl.innerHTML = stepsEl.innerHTML.replace(
            /<div class="g-step active">📱.*?<\/div>/,
            `<div class="g-step done">✅ ${allLeads.length} leads con teléfono</div>`
        );
        barEl.style.width = '60%';

        // STEP 3: Filter by quality (rating >= 3.5, reviews >= 5)
        const lowQuality = allLeads.filter(l => (l.rating && l.rating < 3.5) || (l.total_reviews !== undefined && l.total_reviews < 5));
        allLeads = allLeads.filter(l => {
            if (l.rating && l.rating < 3.5) return false;
            if (l.total_reviews !== undefined && l.total_reviews < 5) return false;
            return true;
        });

        if (lowQuality.length > 0) {
            stepsEl.innerHTML += `<div class="g-step active">🧹 Eliminando ${lowQuality.length} con mala calidad...</div>`;
            for (const lead of lowQuality) {
                try { await apiDelete(`/leads/${lead.id}`); } catch (e) { /* ignore */ }
            }
            stepsEl.innerHTML = stepsEl.innerHTML.replace(
                /🧹 Eliminando.*?<\/div>/,
                `✅ ${lowQuality.length} leads de baja calidad eliminados</div>`
            );
        }
        barEl.style.width = '80%';

        // STEP 4: WhatsApp Verification
        if (allLeads.length > 0) {
            stepsEl.innerHTML += `<div class="g-step active">🔍 Verificando números de WhatsApp (${allLeads.length})...</div>`;
            try {
                const resStatus = await fetch(`${WA_API}/status`);
                const st = await resStatus.json();
                if (st.status === 'ready') {
                    const usIndicators = ['texas','california','florida','new york','illinois','arizona','nevada','colorado','georgia','north carolina','ohio','michigan','pennsylvania','new jersey','virginia','washington','massachusetts','tennessee','indiana','maryland','minnesota','wisconsin','missouri','oregon','oklahoma','connecticut','utah','iowa','arkansas','kansas','nebraska','new mexico','hawaii','idaho','alabama','louisiana','south carolina','kentucky','mississippi','houston','dallas','san antonio','austin','los angeles','chicago','phoenix','san diego','san jose','miami','tampa','orlando','atlanta','denver','seattle','portland','las vegas','charlotte','nashville','boston','detroit','minneapolis','sacramento','san francisco','el paso','fort worth','tucson','albuquerque','raleigh','memphis','baltimore','louisville','new orleans','salt lake','jacksonville','indianapolis','columbus','philadelphia','pittsburgh','cleveland','cincinnati','st. louis','st louis','usa','united states'];
                    const loc = (selectedCategory.location || '').toLowerCase();
                    const isUS = usIndicators.some(s => loc.includes(s));

                    const contacts = allLeads.map(l => ({ phone: l.phone, name: l.name, id: l.id }));
                    const verifyRes = await fetch(`${WA_API}/verify-numbers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phones: contacts, isUS: isUS })
                    });
                    const verifyData = await verifyRes.json();
                    
                    if (verifyData.invalid && verifyData.invalid.length > 0) {
                        stepsEl.innerHTML += `<div class="g-step active">🧹 Eliminando ${verifyData.invalid.length} leads sin WhatsApp...</div>`;
                        for (const inv of verifyData.invalid) {
                            try { await apiDelete(`/leads/${inv.id}`); } catch(e){}
                        }
                    }
                    
                    if (verifyData.valid) {
                        const validIds = verifyData.valid.map(v => v.id);
                        allLeads = allLeads.filter(l => validIds.includes(l.id));
                    }
                    
                    stepsEl.innerHTML = stepsEl.innerHTML.replace(
                        /🔍 Verificando.*?<\/div>/,
                        `<div class="g-step done">✅ Verificación: ${allLeads.length} válidos, ${verifyData.invalid ? verifyData.invalid.length : 0} sin WhatsApp eliminados</div>`
                    ).replace(/🧹 Eliminando.*?<\/div>/, ''); // Remove the sub-step message to keep UI clean
                } else {
                    stepsEl.innerHTML += `<div class="g-step warn">⚠️ WhatsApp no conectado, se omitió la verificación</div>`;
                }
            } catch (e) {
                stepsEl.innerHTML += `<div class="g-step warn">⚠️ Error verificando WhatsApp: ${e.message}</div>`;
            }
        }
        barEl.style.width = '100%';

        // Store leads ready to send
        verifiedLeads = allLeads;

        // Final result
        if (allLeads.length > 0) {
            stepsEl.innerHTML += `<div class="g-step done highlight">🎯 ${allLeads.length} leads listos para enviar WhatsApp</div>`;
            document.getElementById('g-composer').classList.remove('hidden');
            document.getElementById('composer-lead-count').textContent = `${allLeads.length} destinatarios`;
            document.getElementById('g-action-panel').classList.add('hidden');
        } else {
            stepsEl.innerHTML += '<div class="g-step warn">⚠️ No hay leads con teléfono para enviar</div>';
        }

        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Re-analizar';
        document.getElementById('analyze-hint').textContent = `Último análisis: ${allLeads.length} leads con teléfono listos`;

    } catch (e) {
        stepsEl.innerHTML += `<div class="g-step error">❌ Error: ${e.message}</div>`;
    }

    isAnalyzing = false;
    btn.disabled = false;

    updateCategoryStats();
    loadCategoryLeads();
    loadCategories();
}

// ── Send WhatsApp ──
async function sendWAToCategory() {
    if (!selectedCategory || isSending) return;

    const message = document.getElementById('wa-compose-msg')?.value?.trim();
    const delayS = parseInt(document.getElementById('wa-compose-delay')?.value) || 35;
    const batchSize = parseInt(document.getElementById('wa-batch-size')?.value) || 6;
    const batchPauseMin = parseInt(document.getElementById('wa-batch-pause')?.value) || 15;

    if (!message) { alert('Escribe el mensaje a enviar'); return; }
    if (delayS < 30) { alert('El delay mínimo es 30 segundos por seguridad'); return; }

    // Check WA
    try {
        const res = await fetch(`${WA_API}/status`);
        const data = await res.json();
        if (data.status !== 'ready') { alert('⚠️ WhatsApp no está conectado.'); return; }
    } catch (e) { alert('⚠️ Servidor WhatsApp no disponible.'); return; }

    // Check if a bulk send is already running (e.g. after page reload)
    try {
        const bulkRes = await fetch(`${WA_API}/bulk-status`);
        const bulkData = await bulkRes.json();
        if (bulkData.running) {
            // Re-attach to the existing send instead of starting a new one
            isSending = true;
            const sendBtn = document.getElementById('btn-send-wa');
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<div class="spinner-sm"></div> Enviando...';
            document.getElementById('send-progress').classList.remove('hidden');
            document.getElementById('send-total-label').textContent = `de ${bulkData.total}`;
            document.getElementById('send-log').innerHTML = '<div class="log-entry">⏳ Reconectando al envío en curso...</div>';
            if (waCatPolling) clearInterval(waCatPolling);
            waCatPolling = setInterval(async () => {
                try {
                    const r = await fetch(`${WA_API}/bulk-status`);
                    const s = await r.json();
                    document.getElementById('send-sent').textContent = s.sent;
                    document.getElementById('send-failed').textContent = s.failed;
                    const pct = s.total > 0 ? ((s.sent + s.failed) / s.total * 100) : 0;
                    document.getElementById('send-bar').style.width = `${pct}%`;
                    let logHtml = '';
                    if (s.sentContacts && s.sentContacts.length > 0) {
                        logHtml += s.sentContacts.map(c => {
                            const t = new Date(c.sentAt).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
                            return `<div class="log-entry log-success">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                                <span><b>${esc(c.name || c.phone)}</b> &mdash; ${esc(c.phone)} <span style="opacity:0.6;font-size:11px">(${esc(c.session)})</span></span>
                                <span class="premium-log-time">${t}</span>
                            </div>`;
                        }).join('');
                    }
                    if (s.errors && s.errors.length > 0) {
                        logHtml += s.errors.map(e => `<div class="log-entry log-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            <span><b>${esc(e.name || e.phone)}</b> &mdash; ${esc(e.phone)}: ${esc(e.error)}</span>
                        </div>`).join('');
                    }
                    if (logHtml) {
                        document.getElementById('send-log').innerHTML = logHtml;
                    }
                    // Show anti-ban pause indicator if server is pausing between batches
                    if (s.pauseUntil) {
                        const targetMs = new Date(s.pauseUntil).getTime();
                        const msLeft = Math.max(0, targetMs - Date.now());
                        const m = Math.floor(msLeft / 60000);
                        const sec = Math.floor((msLeft % 60000) / 1000);
                        const tStr = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                        document.getElementById('send-log').innerHTML += `<div class="log-entry log-warning">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>Pausa anti-ban activa: <b style="font-family: inherit; font-size: 13px;">${tStr}</b> restantes</span>
                        </div>`;
                    }
                    if (!s.running) {
                        clearInterval(waCatPolling);
                        waCatPolling = null;
                        isSending = false;
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar';
                        updateCategoryStats(); loadCategoryLeads(); loadCategories(); loadStats();
                    }
                } catch(e) { /* ignore */ }
            }, 1000);
            return; // Don't start a new one
        }
    } catch (e) { /* if bulk-status fails just proceed normally */ }

    // Get leads
    let leadsToSend = verifiedLeads;
    if (!leadsToSend || leadsToSend.length === 0) {
        let allLeads = [];
        let page = 1, totalPages = 1;
        while (page <= totalPages) {
            let url = `/leads/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}&page=${page}&per_page=200&has_website=no&exclude_status=contacted`;
            if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;
            const data = await apiGet(url);
            totalPages = data.total_pages;
            allLeads = allLeads.concat(data.leads.filter(l => l.phone));
            page++;
        }
        leadsToSend = allLeads;
    }

    if (leadsToSend.length === 0) { alert('No hay leads para enviar'); return; }

    const est = Math.ceil((leadsToSend.length * delayS) / 60);
    if (!confirm(`Enviar WhatsApp a ${leadsToSend.length} negocios de "${selectedCategory.keyword}"?\n\nTiempo estimado: ~${est} min`)) return;

    isSending = true;
    const sendBtn = document.getElementById('btn-send-wa');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="spinner-sm"></div> Enviando...';

    const sentLeadIds = leadsToSend.map(l => l.id);
    const contacts = leadsToSend.map(l => ({ phone: l.phone, name: l.name }));

    const progressEl = document.getElementById('send-progress');
    progressEl.classList.remove('hidden');
    document.getElementById('send-total-label').textContent = `de ${contacts.length}`;
    document.getElementById('send-log').innerHTML = '<div class="log-entry">⏳ Iniciando envío masivo...</div>';

    try {
        const usIndicators = ['texas','california','florida','new york','illinois','arizona','nevada','colorado','georgia','north carolina','ohio','michigan','pennsylvania','new jersey','virginia','washington','massachusetts','tennessee','indiana','maryland','minnesota','wisconsin','missouri','oregon','oklahoma','connecticut','utah','iowa','arkansas','kansas','nebraska','new mexico','hawaii','idaho','alabama','louisiana','south carolina','kentucky','mississippi','houston','dallas','san antonio','austin','los angeles','chicago','phoenix','san diego','san jose','miami','tampa','orlando','atlanta','denver','seattle','portland','las vegas','charlotte','nashville','boston','detroit','minneapolis','sacramento','san francisco','el paso','fort worth','tucson','albuquerque','raleigh','memphis','baltimore','louisville','new orleans','salt lake','jacksonville','indianapolis','columbus','philadelphia','pittsburgh','cleveland','cincinnati','st. louis','st louis','usa','united states'];
        const loc = (selectedCategory.location || '').toLowerCase();
        const isUS = usIndicators.some(s => loc.includes(s));

        const res = await fetch(`${WA_API}/send-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contacts, 
                message, 
                botMessage: "", 
                delayMs: delayS * 1000,
                batchSize,
                batchPauseMin,
                isUS
            })
        });
        const data = await res.json();
        if (data.error) { alert('Error: ' + data.error); isSending = false; return; }

        if (waCatPolling) clearInterval(waCatPolling);
        waCatPolling = setInterval(async () => {
            try {
                const r = await fetch(`${WA_API}/bulk-status`);
                const s = await r.json();
                document.getElementById('send-sent').textContent = s.sent;
                document.getElementById('send-failed').textContent = s.failed;
                const pct = s.total > 0 ? ((s.sent + s.failed) / s.total * 100) : 0;
                document.getElementById('send-bar').style.width = `${pct}%`;

                // Build live log from sentContacts + errors
                const logEl = document.getElementById('send-log');
                let logHtml = '';
                if (s.sentContacts && s.sentContacts.length > 0) {
                    logHtml += s.sentContacts.map(c => {
                        const t = new Date(c.sentAt).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
                        return `<div class="log-entry log-success">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                            <span><b>${esc(c.name || c.phone)}</b> &mdash; ${esc(c.phone)} <span style="opacity:0.6;font-size:11px">(${esc(c.session)})</span></span>
                            <span class="premium-log-time">${t}</span>
                        </div>`;
                    }).join('');
                }
                if (s.errors && s.errors.length > 0) {
                    logHtml += s.errors.map(e => `<div class="log-entry log-error">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        <span><b>${esc(e.name || e.phone)}</b> &mdash; ${esc(e.phone)}: ${esc(e.error)}</span>
                    </div>`).join('');
                }
                if (logHtml) logEl.innerHTML = logHtml;

                // Show anti-ban pause indicator if server is pausing between batches
                if (s.pauseUntil) {
                    const targetMs = new Date(s.pauseUntil).getTime();
                    const msLeft = Math.max(0, targetMs - Date.now());
                    const m = Math.floor(msLeft / 60000);
                    const sec = Math.floor((msLeft % 60000) / 1000);
                    const tStr = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                    logEl.innerHTML += `<div class="log-entry log-warning">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>Pausa anti-ban activa: <b style="font-family: inherit; font-size: 13px;">${tStr}</b> restantes</span>
                    </div>`;
                }

                logEl.scrollTop = logEl.scrollHeight;

                if (!s.running) {
                    clearInterval(waCatPolling);
                    waCatPolling = null;

                    let finalLog = `<div class="log-entry log-success" style="border-left-color: #3b82f6; background: rgba(59, 130, 246, 0.05); color: #60a5fa;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <span>Completado: <b>${s.sent} enviados</b>, <b>${s.failed} fallidos</b></span>
                    </div>` + logHtml;
                    logEl.innerHTML = finalLog;

                    // Mark as contacted
                    try {
                        await fetch('/api/leads/bulk-contacted', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(sentLeadIds)
                        });
                    } catch (e) { /* ignore */ }

                    isSending = false;
                    verifiedLeads = null;
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar';

                    updateCategoryStats();
                    loadCategoryLeads();
                    loadCategories();
                    loadStats();
                }
            } catch (e) { /* ignore */ }
        }, 2000);
    } catch (e) {
        alert('Error: ' + e.message);
        isSending = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar';
    }
}

// ── Tab switching ──
function switchGestionTab(tab) {
    ['pending', 'contacted'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
        document.getElementById(`tab-content-${t}`).style.display = t === tab ? '' : 'none';
    });
    tab === 'pending' ? loadCategoryLeads() : loadContactedLeads();
}

// ── Pending Leads Table ──
async function loadCategoryLeads(page = 1) {
    if (!selectedCategory) return;
    categoryPage = page;

    let url = `/leads/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}&page=${page}&per_page=50&exclude_status=contacted`;
    if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;

    try {
        const data = await apiGet(url);
        const tbody = document.getElementById('cat-leads-body');

        if (!data.leads || data.leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay leads pendientes</td></tr>';
            document.getElementById('cat-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.leads.map(lead => `
            <tr>
                <td><span class="lead-name" onclick="showLeadDetail(${lead.id})">${esc(lead.name)}</span></td>
                <td>${renderRating(lead.rating)}</td>
                <td>${lead.total_reviews || 0}</td>
                <td class="text-muted">${esc(lead.phone || '—')}</td>
                <td>
                    <button class="btn-icon" onclick="markAsContacted(${lead.id})" title="Marcar como contactado" style="color:var(--green)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </button>
                    <button class="btn-icon" onclick="showLeadDetail(${lead.id})" title="Ver detalle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn-icon danger" onclick="deleteSingleLead(${lead.id})" title="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');

        renderCatPagination('cat-pagination', data.page, data.total_pages, loadCategoryLeads);
    } catch (e) {
        console.error('Error:', e);
    }
}

async function markAsContacted(leadId) {
    try {
        await fetch('/api/leads/bulk-contacted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([leadId])
        });
        loadCategoryLeads(categoryPage);
        updateCategoryStats();
        loadCategories();
    } catch (e) {
        alert('Error al marcar como contactado');
    }
}

async function markCategoryAsContacted() {
    if (!selectedCategory) return;
    if (!confirm(`¿Marcar TODOS los leads de "${selectedCategory.keyword}" como contactados?\n\nEsto moverá la categoría completa a "Contactados".`)) return;

    try {
        // Fetch ALL leads in this category (no filters)
        let allIds = [];
        let page = 1, totalPages = 1;
        while (page <= totalPages) {
            let url = `/leads/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}&page=${page}&per_page=200`;
            if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;
            const data = await apiGet(url);
            totalPages = data.total_pages;
            allIds = allIds.concat(data.leads.map(l => l.id));
            page++;
        }

        if (allIds.length === 0) { alert('No hay leads pendientes'); return; }

        await fetch('/api/leads/bulk-contacted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allIds)
        });

        alert(`✅ ${allIds.length} leads marcados como contactados`);
        loadCategoryLeads();
        loadContactedLeads();
        updateCategoryStats();
        loadCategories();
    } catch (e) {
        alert('Error al marcar categoría como contactada');
    }
}

// ── Contacted Leads Table ──
async function loadContactedLeads(page = 1) {
    if (!selectedCategory) return;
    contactedPage = page;

    let url = `/leads/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}&page=${page}&per_page=50&filter_status=contacted`;
    if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;

    try {
        const data = await apiGet(url);
        const tbody = document.getElementById('cat-contacted-body');

        if (!data.leads || data.leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin leads contactados aún</td></tr>';
            document.getElementById('cat-contacted-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.leads.map(lead => `
            <tr>
                <td><span class="lead-name" onclick="showLeadDetail(${lead.id})">${esc(lead.name)}</span></td>
                <td>${renderRating(lead.rating)}</td>
                <td>${lead.total_reviews || 0}</td>
                <td class="text-muted">${esc(lead.phone || '—')}</td>
                <td>
                    <span class="badge badge-contacted">
                        ${lead.contacted_at ? new Date(lead.contacted_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : 'Enviado'}
                    </span>
                </td>
            </tr>
        `).join('');

        renderCatPagination('cat-contacted-pagination', data.page, data.total_pages, loadContactedLeads);
    } catch (e) {
        console.error('Error:', e);
    }
}

function renderCatPagination(containerId, current, total, loadFn) {
    const container = document.getElementById(containerId);
    if (total <= 1) { container.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= total; i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="${loadFn.name}(${i})">${i}</button>`;
    }
    container.innerHTML = html;
}

async function deleteSingleLead(id) {
    if (!confirm('¿Eliminar este lead?')) return;
    await apiDelete(`/leads/${id}`);
    loadCategoryLeads(categoryPage);
    loadCategories();
    updateCategoryStats();
    loadStats();
}

async function deleteEntireCategory() {
    if (!selectedCategory) return;
    if (!confirm(`⚠️ ¿Eliminar TODOS los leads de "${selectedCategory.keyword}"?\n\nEsta acción NO se puede deshacer.`)) return;

    showLoading(true);
    let url = `/bulk/by-keyword?keyword=${encodeURIComponent(selectedCategory.keyword)}`;
    if (selectedCategory.location) url += `&location=${encodeURIComponent(selectedCategory.location)}`;
    const data = await apiDelete(url);
    showLoading(false);

    alert(`✅ ${data.deleted} leads eliminados`);
    selectedCategory = null;
    document.getElementById('category-detail').classList.add('hidden');
    document.getElementById('gestion-empty').classList.remove('hidden');
    loadCategories();
    loadStats();
}

async function purgeAll() {
    if (!confirm('🚨 ¿PURGAR TODO? Esto eliminará TODOS los leads, búsquedas y registros.\n\nEsta acción NO se puede deshacer.')) return;
    if (!confirm('¿Estás COMPLETAMENTE seguro?')) return;

    showLoading(true);
    const data = await apiDelete('/bulk/all');
    showLoading(false);

    alert(`✅ Base de datos purgada. ${data.deleted} leads eliminados.`);
    selectedCategory = null;
    document.getElementById('category-detail').classList.add('hidden');
    document.getElementById('gestion-empty').classList.remove('hidden');
    loadCategories();
    loadStats();
}

// ── WhatsApp Status in Gestión Header ──
async function checkGestionWAStatus() {
    const dot = document.querySelector('#wa-gestion-status .wa-dot');
    const text = document.getElementById('wa-gestion-status-text');
    try {
        const res = await fetch(`${WA_API}/status`);
        const data = await res.json();
        if (data.status === 'ready') {
            dot.className = 'wa-dot connected';
            text.textContent = `WhatsApp: ${data.info?.pushName || 'Conectado'}`;
        } else {
            dot.className = 'wa-dot disconnected';
            text.textContent = 'WhatsApp: Desconectado';
        }
    } catch (e) {
        dot.className = 'wa-dot disconnected';
        text.textContent = 'WhatsApp: Servidor apagado';
    }
}

// ─────────────────────────────────────────────
// WHATSAPP VIEW
// ─────────────────────────────────────────────
const WA_API = 'http://localhost:3005';
let waPollingInterval = null;
let waBulkPollingInterval = null;

async function checkWAStatus() {
    try {
        const res = await fetch(`${WA_API}/status`);
        const data = await res.json();
        updateWAUI(data);
    } catch (e) {
        // WhatsApp server not running
        updateWAUIOffline();
    }
}

function updateWAUIOffline() {
    const badge = document.getElementById('wa-status-badge');
    badge.textContent = 'Servidor Apagado';
    badge.className = 'wa-status-badge disconnected';

    document.getElementById('wa-connect-content').innerHTML = `
        <div style="padding:20px">
            <p style="font-size:48px;margin-bottom:12px">⚠️</p>
            <h4 style="margin-bottom:8px">Servidor WhatsApp no detectado</h4>
            <p class="text-muted" style="margin-bottom:16px">Primero inicia el servicio de WhatsApp:</p>
            <div style="background:var(--bg-secondary);border-radius:var(--radius);padding:12px;font-family:monospace;font-size:13px;text-align:left">
                <p style="color:var(--text-muted)">cd whatsapp-sender</p>
                <p style="color:var(--text-muted)">npm install</p>
                <p style="color:#25D366">node server.js</p>
            </div>
            <button class="btn btn-sm btn-ghost" style="margin-top:16px" onclick="checkWAStatus()">Reintentar conexión</button>
        </div>
    `;
    document.getElementById('btn-wa-send').disabled = true;
}

function updateWAUI(data) {
    const badge = document.getElementById('wa-status-badge');
    const content = document.getElementById('wa-connect-content');
    const sendBtn = document.getElementById('btn-wa-send');

    const activeSessions = data.all_sessions ? data.all_sessions.filter(s => s.status === 'ready') : [];
    const qrSessions = data.all_sessions ? data.all_sessions.filter(s => s.status === 'qr_ready' || s.status === 'connecting' || s.status === 'syncing') : [];
    
    // Si no hay sesiones en absoluto (estado inicial vacío total)
    if (data.all_sessions && data.all_sessions.length === 0) {
        badge.textContent = 'Sin Sesiones';
        badge.className = 'wa-status-badge disconnected';
        content.innerHTML = `
            <div style="padding:20px">
                <p style="font-size:48px;margin-bottom:12px">📱</p>
                <h4 style="margin-bottom:8px">Conectar Dispositivos</h4>
                <p class="text-muted">Agrega hasta 4 cuentas para rotación Anti-Ban.</p>
                <button class="btn btn-primary" style="margin-top:16px" onclick="forceNewQR()">Generar QR</button>
            </div>
        `;
        sendBtn.disabled = true;
        if (waPollingInterval) { clearInterval(waPollingInterval); waPollingInterval = null; }
        return;
    }

    // Hay sesiones activas
    if (activeSessions.length > 0) {
        badge.textContent = `✅ ${activeSessions.length} Activos`;
        badge.className = 'wa-status-badge connected';
        sendBtn.disabled = false;
        if (data.bulk && data.bulk.running) startBulkPolling();
    } else {
        badge.textContent = 'Conectando...';
        badge.className = 'wa-status-badge connecting';
        sendBtn.disabled = true;
    }

    let html = '';
    
    if (activeSessions.length > 0) {
        html += '<div style="margin-bottom:16px;"><h4>📱 Sesiones Conectadas</h4><ul style="list-style:none;padding:0;margin-top:8px;">';
        activeSessions.forEach(s => {
            html += `<li style="padding:8px;background:var(--bg-secondary);margin-bottom:4px;border-radius:4px;display:flex;justify-content:space-between">
                <span>${s.id}</span> <span style="color:#25d366">${s.phone || ''}</span>
            </li>`;
        });
        html += '</ul></div>';
    }

    // Si hay una sesión en espera de QR
    if (qrSessions.length > 0) {
        // Marcador para cargar el QR
        html += `<div id="wa-qr-box" style="margin-top:20px; padding:15px; border:1px solid var(--border); border-radius:8px;">
                    <div class="spinner" style="margin:0 auto 12px"></div>
                    <p class="text-muted">Generando código QR...</p>
                 </div>`;
        fetchAndShowQR(); // Llamar asíncronamente para llenar el marcador
    } else if (data.all_sessions.length < 4) {
        html += `<button class="btn btn-sm btn-ghost" onclick="forceNewQR()">+ Vincular otra cuenta (${data.all_sessions.length}/4)</button>`;
    } else {
        html += `<p class="text-muted text-sm">Límite de 4 cuentas alcanzado.</p>`;
    }
    
    if (activeSessions.length > 0) {
        html += ` <br><button class="btn btn-sm btn-ghost danger" onclick="logoutWA()" style="margin-top:8px;">Desconectar Todo</button>`;
    }

    content.innerHTML = html;
    
    // Mantener un polling global para que actualice la lista y los estados
    if (!waPollingInterval) waPollingInterval = setInterval(checkWAStatus, 3000);
}

async function forceNewQR() {
    await fetch(`${WA_API}/qr`);
    // Render immediate loading state
    document.getElementById('wa-connect-content').innerHTML += `
        <div id="wa-qr-box" style="margin-top:20px; padding:15px; border:1px solid var(--border); border-radius:8px;">
            <div class="spinner" style="margin:0 auto 12px"></div>
            <p class="text-muted">Generando código QR...</p>
        </div>`;
    checkWAStatus();
}

async function fetchAndShowQR() {
    try {
        const res = await fetch(`${WA_API}/qr`);
        const data = await res.json();
        const qrBox = document.getElementById('wa-qr-box');
        if (!qrBox) return; // if UI changed

        if ((data.status === 'qr_ready' || data.status === 'waiting') && data.qr && data.qr !== 'generating') {
            qrBox.innerHTML = `
                <div class="wa-qr-container">
                    <img src="${data.qr}" alt="WhatsApp QR Code" width="200" height="200" style="margin:auto">
                    <p class="text-muted" style="margin-top:10px">Escanea este código con tu teléfono</p>
                </div>
            `;
        } else if (data.status === 'waiting' && data.message) {
            qrBox.innerHTML = `
                <div class="spinner" style="margin:0 auto 12px"></div>
                <p class="text-muted">${data.message}</p>
            `;
        }
    } catch (e) {
        console.error('Error fetching QR:', e);
    }
}

async function logoutWA() {
    if (!confirm('¿Desconectar WhatsApp?')) return;
    try {
        await fetch(`${WA_API}/logout`, { method: 'POST' });
        checkWAStatus();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function loadWALeadCount() {
    try {
        const filter = document.getElementById('wa-filter')?.value || 'no-website';
        let url = '/leads?per_page=1';
        if (filter === 'no-website') {
            // Leads without website that have a phone
            url = '/leads?per_page=1&status=new';
        } else if (filter === 'qualified') {
            url = '/leads?per_page=1&status=qualified';
        } else {
            url = '/leads?per_page=1';
        }
        const data = await apiGet(url);
        document.getElementById('wa-lead-count').textContent = `${data.total || 0} leads encontrados`;
    } catch (e) {
        document.getElementById('wa-lead-count').textContent = '';
    }
}

async function startBulkWA() {
    const message = document.getElementById('wa-message')?.value?.trim();
    const delayS = parseInt(document.getElementById('wa-delay')?.value) || 35;
    const filter = document.getElementById('wa-filter')?.value || 'no-website';

    if (!message) {
        alert('Escribe un mensaje primero');
        return;
    }
    if (delayS < 30) {
        alert('El delay mínimo es 30 segundos para evitar ban');
        return;
    }

    // Fetch all qualifying leads with phone numbers
    let allLeads = [];
    let page = 1;
    let totalPages = 1;

    showLoading(true);
    try {
        while (page <= totalPages) {
            let url = `/leads?page=${page}&per_page=200`;
            if (filter === 'qualified') url += '&status=qualified';
            else if (filter === 'no-website') url += '&status=new';

            const data = await apiGet(url);
            totalPages = data.total_pages;

            const withPhone = data.leads.filter(l => {
                if (!l.phone) return false;
                if (filter === 'no-website' && l.has_real_website) return false;
                return true;
            });
            allLeads = allLeads.concat(withPhone);
            page++;
        }
    } catch (e) {
        showLoading(false);
        alert('Error cargando leads: ' + e.message);
        return;
    }
    showLoading(false);

    if (allLeads.length === 0) {
        alert('No se encontraron leads con teléfono para el filtro seleccionado');
        return;
    }

    const est = Math.ceil((allLeads.length * delayS) / 60);
    if (!confirm(`¿Enviar mensaje a ${allLeads.length} leads?\n\nTiempo estimado: ~${est} minutos\nDelay: ${delayS}s entre mensajes`)) return;

    // Prepare contacts
    const contacts = allLeads.map(l => ({
        phone: l.phone,
        name: l.name
    }));

    try {
        const res = await fetch(`${WA_API}/send-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts, message, delayMs: delayS * 1000 })
        });
        const data = await res.json();

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        // Show progress card and start polling
        document.getElementById('wa-progress-card').classList.remove('hidden');
        document.getElementById('btn-wa-send').disabled = true;
        document.getElementById('btn-wa-cancel').classList.remove('hidden');
        document.getElementById('wa-progress-log').innerHTML = `<div class="log-entry">⏳ Enviando a ${contacts.length} contactos (~${data.estimatedMinutes} min)...</div>`;
        startBulkPolling();
    } catch (e) {
        alert('Error conectando con WhatsApp sender: ' + e.message);
    }
}

function startBulkPolling() {
    if (waBulkPollingInterval) clearInterval(waBulkPollingInterval);
    waBulkPollingInterval = setInterval(pollBulkStatus, 2000);
}

async function pollBulkStatus() {
    try {
        const res = await fetch(`${WA_API}/bulk-status`);
        const data = await res.json();

        document.getElementById('wa-p-total').textContent = data.total;
        document.getElementById('wa-p-sent').textContent = data.sent;
        document.getElementById('wa-p-failed').textContent = data.failed;

        const progress = data.total > 0 ? ((data.sent + data.failed) / data.total * 100) : 0;
        document.getElementById('wa-progress-bar').style.width = `${progress}%`;

        if (!data.running) {
            clearInterval(waBulkPollingInterval);
            waBulkPollingInterval = null;
            document.getElementById('btn-wa-send').disabled = false;
            document.getElementById('btn-wa-cancel').classList.add('hidden');

            let logHtml = `<div class="log-entry log-success">✅ Envío completado: ${data.sent} enviados, ${data.failed} fallidos</div>`;
            if (data.errors && data.errors.length > 0) {
                logHtml += data.errors.map(e =>
                    `<div class="log-entry log-error">❌ ${esc(e.name)} (${esc(e.phone)}): ${esc(e.error)}</div>`
                ).join('');
            }
            document.getElementById('wa-progress-log').innerHTML = logHtml;
        }
    } catch (e) {
        console.error('Error polling bulk status:', e);
    }
}

async function cancelBulkWA() {
    if (!confirm('¿Cancelar el envío masivo?')) return;
    try {
        await fetch(`${WA_API}/bulk-cancel`, { method: 'POST' });
    } catch (e) {
        console.error('Error cancelling:', e);
    }
}

// Close modal with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
