require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sm = require('./src/session_manager');
const dns = require('dns');

// Force IPv4 resolution (Fixes "Connection Failure" WebSocket drops in Node.js on some Windows networks)
dns.setDefaultResultOrder('ipv4first');

// Prevent crashes from unhandled errors (e.g. EBUSY file locks on Windows)
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception (process kept alive):', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled rejection (process kept alive):', err?.message || err);
});

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WA_PORT || 3001;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', sessions: sm.getAllSessions() });
});

// Backward compatible status
app.get('/status', (req, res) => {
    const active = sm.getActiveSessions();
    res.json({
        status: active.length > 0 ? 'ready' : 'disconnected',
        info: active.length > 0 ? active[0].info : null,
        bulk: sm.bulkStatus,
        all_sessions: sm.getAllSessions()
    });
});

// QR Code for frontend. Frontend expects `{ status: 'qr_ready', qr: dataUrl }`
app.get('/qr', (req, res) => {
    const qrData = sm.getQrCode();
    if (qrData === 'generating') {
        res.json({ status: 'waiting', message: 'Generando nuevo código...' });
    } else if (qrData === 'syncing') {
        res.json({ status: 'waiting', message: 'Cuenta vinculada. Sincronizando chats (puede tardar minutos)...' });
    } else if (qrData) {
        res.json({ status: 'qr_ready', qr: qrData });
    } else {
        const active = sm.getActiveSessions();
        if (active.length > 0) {
            res.json({ status: 'already_connected', info: active[0].info });
        } else {
            res.json({ status: 'waiting', message: 'No more sessions available or wait.' });
        }
    }
});

// Logout back compat (just dummy for now, since we have multiple sessions)
app.post('/logout', async (req, res) => {
    try {
        for (const s of sm.sessions.values()) {
            try { await s.client.destroy(); } catch(e){}
        }
        sm.sessions.clear();
        const fs = require('fs');
        if (fs.existsSync('./.wwebjs_auth')) {
            fs.rmSync('./.wwebjs_auth', { recursive: true, force: true });
        }
        res.json({ success: true, message: 'All sessions logged out' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Send single message
app.post('/send', async (req, res) => {
    const active = sm.getActiveSessions();
    if (active.length === 0) return res.status(400).json({ error: 'No active WhatsApp sessions.' });
    
    const { phone, message } = req.body;
    const s = active[0]; // Use first available
    
    try {
        const targetId = sm.formatPhone(phone);
        const [result] = await s.sock.onWhatsApp(targetId);
        if (result && result.exists) {
            await s.sock.sendMessage(result.jid, { text: message });
            res.json({ success: true, message: 'Message sent via ' + s.id });
        } else {
            throw new Error('Not registered');
        }
    } catch(err) {
        res.json({ success: false, error: err.message });
    }
});

// Bulk send API
app.post('/send-bulk', async (req, res) => {
    const active = sm.getActiveSessions();
    if (active.length === 0) return res.status(400).json({ error: 'No active WhatsApp sessions.' });
    if (sm.bulkStatus.running) return res.status(400).json({ error: 'Bulk running.' });

    const { contacts, message, botMessage, delayMs = 35000, batchSize = 6, batchPauseMin = 15, isUS = false } = req.body;
    
    // Start background process
    sm.processBulkSend(contacts, message, botMessage, delayMs, batchSize, batchPauseMin, isUS);
    
    res.json({ 
        status: 'started', 
        total: contacts.length,
        estimatedMinutes: Math.ceil((contacts.length * delayMs) / 60000)
    });
});

app.get('/bulk-status', (req, res) => {
    res.json(sm.bulkStatus);
});

app.post('/bulk-cancel', (req, res) => {
    sm.bulkStatus.running = false;
    res.json({ success: true });
});

app.post('/verify-numbers', async (req, res) => {
    const { phones, isUS = false } = req.body;
    const results = await sm.verifyNumbers(phones, isUS);
    res.json(results);
});

app.listen(PORT, () => {
    console.log(`\n🟢 Baileys WhatsApp Server running on port ${PORT}`);
    console.log(`📱 Connect up to 4 sessions using the web dashboard.`);
});
