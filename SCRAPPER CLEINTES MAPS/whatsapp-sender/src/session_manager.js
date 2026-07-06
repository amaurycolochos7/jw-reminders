const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const fs = require('fs');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // id -> { client, status, qr, info }
        this.botContacts = new Map(); // chatId -> { botMessage, timestamp, sentReply }
        this.bulkStatus = {
            running: false,
            total: 0,
            sent: 0,
            failed: 0,
            errors: [],
            sentContacts: [],
            startedAt: null,
            completedAt: null
        };
        // Auto-load existing sessions from auth folder
        this.loadExistingSessions();
    }

    loadExistingSessions() {
        if (!fs.existsSync('./.wwebjs_auth')) fs.mkdirSync('./.wwebjs_auth');
        const folders = fs.readdirSync('./.wwebjs_auth');
        for (const folder of folders) {
            if (folder.startsWith('session-')) {
                const id = folder.replace('session-', '');
                this.createSession(id);
            }
        }
    }

    async createSession(clientId) {
        if (this.sessions.has(clientId)) return;

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: clientId }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.sessions.set(clientId, {
            id: clientId,
            client: client,
            status: 'connecting',
            qr: null,
            info: null
        });

        client.on('qr', async (qr) => {
            const s = this.sessions.get(clientId);
            if (s) {
                s.status = 'qr_ready';
                try {
                    s.qr = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
                    console.log(`[session-${clientId}] QR code ready for scanning!`);
                } catch (err) { }
            }
        });

        client.on('authenticated', () => {
            console.log(`✅ [session-${clientId}] Authenticated! Syncing...`);
            const s = this.sessions.get(clientId);
            if (s) {
                s.status = 'syncing';
                s.qr = null;
            }
        });

        client.on('auth_failure', msg => {
            console.error(`❌ [session-${clientId}] Authentication failure:`, msg);
        });

        client.on('ready', () => {
            console.log(`✅ Session ${clientId} is connected!`);
            const s = this.sessions.get(clientId);
            if (s) {
                s.status = 'ready';
                s.qr = null;
                s.info = {
                    phone: client.info.wid.user,
                    pushName: client.info.pushname || 'Account'
                };
            }
        });

        client.on('disconnected', (reason) => {
            console.log(`❌ Session ${clientId} disconnected:`, reason);
            const s = this.sessions.get(clientId);
            if (s) {
                s.status = 'disconnected';
                s.qr = null;
                s.info = null;
                this.sessions.delete(clientId);
            }
            // Clean up auth files with delay to avoid EBUSY on Windows
            setTimeout(() => {
                try {
                    fs.rmSync(`./.wwebjs_auth/session-${clientId}`, { recursive: true, force: true });
                } catch (err) {
                    console.log(`⚠️ Could not clean session-${clientId} files: ${err.message}`);
                }
            }, 2000);
        });



        client.initialize().catch(err => {
            console.error(`Error initializing session ${clientId}:`, err.message || err);
            const s = this.sessions.get(clientId);
            if (s) {
                s.status = 'failed';
                s.qr = null;
            }
        });
    }

    getAllSessions() {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            status: s.status,
            phone: s.info?.phone
        }));
    }

    getActiveSessions() {
        return Array.from(this.sessions.values()).filter(s => s.status === 'ready');
    }

    getQrCode() {
        // Find first tracking session that has a fully rendered QR code
        let pending = Array.from(this.sessions.values()).find(s => s.status === 'qr_ready');
        if (pending && pending.qr) return pending.qr;

        let syncing = Array.from(this.sessions.values()).find(s => s.status === 'syncing');
        if (syncing) return 'syncing';

        // If a session is currently starting up but hasn't fully rendered the QR yet, wait
        let connecting = Array.from(this.sessions.values()).find(s => s.status === 'connecting' || (s.status === 'qr_ready' && !s.qr));
        if (connecting) return 'generating';

        // Otherwise, spawn a new session if we are under the limit
        if (this.sessions.size < 4) {
            let i = 1;
            while(this.sessions.has(`S-${i}`)) i++;
            const newId = `S-${i}`;
            this.createSession(newId);
            return 'generating';
        }
        
        return null; // Max reached
    }

    // Load balancer for bulk sending
    async processBulkSend(contacts, messageTemplate, botMessageTemplate, delayMs, batchSize, batchPauseMin, isUS=false) {
        this.bulkStatus.running = true;
        this.bulkStatus.total = contacts.length;
        this.bulkStatus.sent = 0;
        this.bulkStatus.failed = 0;
        this.bulkStatus.errors = [];
        this.bulkStatus.sentContacts = [];
        this.bulkStatus.completedAt = null;
        this.bulkStatus.startedAt = new Date().toISOString();

        const defaultPrefix = isUS ? '1' : '52';

        // Helper: send a single merged message to a contact via a session
        const sendToContact = async (session, contact) => {
            const contactName = contact.name && contact.name.trim() !== '' ? contact.name : 'Amigo';
            const msg1 = this.parseSpintax(messageTemplate.replace(/\{\{name\}\}/gi, contactName));
            const msg2 = botMessageTemplate
                ? this.parseSpintax(botMessageTemplate.replace(/\{\{name\}\}/gi, contactName))
                : null;

            // Merge both parts into ONE message
            const finalMessage = msg2 ? `${msg1}\n\n${msg2}` : msg1;

            try {
                const targetId = this.formatPhone(contact.phone, defaultPrefix);
                const numberDetails = await session.client.getNumberId(targetId);
                if (!numberDetails) throw new Error("Number not registered on WhatsApp");

                const validJid = numberDetails._serialized;

                // Simulate typing before sending
                try {
                    const chat = await session.client.getChatById(validJid);
                    await chat.sendStateTyping();
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
                    await chat.clearState();
                } catch (e) {}

                await session.client.sendMessage(validJid, finalMessage);

                this.bulkStatus.sent++;
                this.bulkStatus.sentContacts.push({
                    phone: contact.phone,
                    name: contact.name || contactName,
                    session: session.id,
                    sentAt: new Date().toISOString()
                });
                console.log(`✅ Sent to ${contact.phone} (${contact.name}) via ${session.id}`);
            } catch (err) {
                this.bulkStatus.failed++;
                this.bulkStatus.errors.push({ phone: contact.phone, name: contact.name, error: err.message });
                console.log(`❌ Failed ${contact.phone}: ${err.message}`);
            }
        };

        let contactIndex = 0;
        let roundNumber = 0;

        while (contactIndex < contacts.length && this.bulkStatus.running) {
            const activeSessions = this.getActiveSessions();
            if (activeSessions.length === 0) {
                console.log("No active sessions to send messages!");
                break;
            }

            // Build this round's batch: one contact per active session
            const batch = [];
            for (let s = 0; s < activeSessions.length && contactIndex < contacts.length; s++) {
                batch.push({ session: activeSessions[s], contact: contacts[contactIndex] });
                contactIndex++;
            }

            roundNumber++;
            console.log(`🚀 Round ${roundNumber}: Firing ${batch.length} messages in parallel...`);

            // Fire all in parallel simultaneously
            await Promise.all(batch.map(({ session, contact }) => sendToContact(session, contact)));

            // After the round, check if we need a macro-batch pause
            const totalSent = this.bulkStatus.sent + this.bulkStatus.failed;
            if (contactIndex < contacts.length && this.bulkStatus.running) {
                if (totalSent % batchSize === 0) {
                    const pauseMs = batchPauseMin * 60 * 1000;
                    this.bulkStatus.pauseUntil = Date.now() + pauseMs;
                    this.bulkStatus.pauseMinutes = batchPauseMin;
                    console.log(`⏳ Macro-batch pause: ${batchPauseMin} mins...`);
                    await new Promise(r => setTimeout(r, pauseMs));
                    this.bulkStatus.pauseUntil = null;
                    this.bulkStatus.pauseMinutes = null;
                } else {
                    const jitter = delayMs * 0.2;
                    const actualDelay = delayMs + (Math.random() * jitter * 2 - jitter);
                    console.log(`⏱ Waiting ${Math.round(actualDelay/1000)}s before next round...`);
                    await new Promise(r => setTimeout(r, actualDelay));
                }
            }
        }

        this.bulkStatus.running = false;
        this.bulkStatus.completedAt = new Date().toISOString();
        console.log("📊 Bulk completed.");
    }

    async verifyNumbers(phones, isUS=false) {
        let active = this.getActiveSessions();
        if (active.length === 0) return { valid: [], invalid: phones.map(p => ({...p, reason: 'No active session'})) };
        
        const s = active[0]; 
        let results = { valid: [], invalid: [] };
        const defaultPrefix = isUS ? '1' : '52';

        for (const contact of phones) {
            try {
                const targetId = this.formatPhone(contact.phone, defaultPrefix);
                const numberDetails = await s.client.getNumberId(targetId);
                if (numberDetails) {
                    results.valid.push({ ...contact, chatId: numberDetails._serialized });
                } else {
                    results.invalid.push({ ...contact, reason: 'No tiene WhatsApp' });
                }
            } catch (err) {
                results.invalid.push({ ...contact, reason: 'Error checking' });
            }
        }
        return results;
    }

    parseSpintax(text) {
        if (!text) return text;
        let matches;
        while ((matches = text.match(/\\{([^{}]+)\\}/))) {
            let options = matches[1].split('|');
            let randomOpt = options[Math.floor(Math.random() * options.length)];
            text = text.replace(matches[0], randomOpt);
        }
        return text;
    }

    formatPhone(phone, defaultPrefix='52') {
        let val = phone.replace(/[^0-9]/g, '');
        if (val.startsWith('521') && val.length === 13) val = '52' + val.substring(3);
        else if (val.length === 10) val = defaultPrefix + val;
        return val + '@c.us'; // wwebjs uses @c.us
    }
}

module.exports = new SessionManager();
