const express = require('express');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();
const { scrapeLinkedIn } = require('./scrape');

const app = express();
const PORT = process.env.PORT || 3000;

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-32k';

app.use(express.json());

// CORS - allow dashboard to call API from any origin
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Serve static files (dashboard)
app.use(express.static(path.join(__dirname)));

// Health check - moved to /api/status so index.html is served at /
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', service: 'LinkedIn Scraper', lastRun: global.lastRun || 'never' });
});

// Kimi AI - Qualify a lead from conversation messages
app.post('/api/qualify', async (req, res) => {
    const { prospect_name, messages } = req.body;

    if (!KIMI_API_KEY) {
        return res.status(500).json({ success: false, error: 'KIMI_API_KEY non configurée' });
    }

    if (!messages || !messages.length) {
        return res.status(400).json({ success: false, error: 'Aucun message à analyser' });
    }

    const conversation = messages.map(m =>
        `${m.sender === 'me' ? 'Moi' : prospect_name}: ${m.content}`
    ).join('\n');

    const systemPrompt = `Tu es un expert en sales B2B et prospection LinkedIn. Analyse cette conversation et fournis une qualification du lead.

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) au format suivant :
{
  "score": "hot" | "warm" | "cold",
  "action": "relance" | "répondre" | "attendre" | "archiver",
  "reason": "explication courte (1-2 phrases)",
  "suggested_message": "suggestion de prochain message à envoyer (ou null si archiver)"
}

Critères :
- "hot" : le prospect montre un intérêt clair, pose des questions, veut avancer
- "warm" : échange en cours, pas encore d'engagement fort
- "cold" : pas de réponse, réponse négative, ou conversation morte depuis longtemps
- "relance" : le prospect n'a pas répondu depuis un moment
- "répondre" : le dernier message vient du prospect, il faut répondre
- "attendre" : on vient d'envoyer un message, laisser du temps
- "archiver" : conversation terminée ou prospect pas intéressé`;

    try {
        const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIMI_API_KEY}`
            },
            body: JSON.stringify({
                model: KIMI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Conversation avec ${prospect_name} :\n\n${conversation}` }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Kimi API error:', response.status, errText);
            return res.status(502).json({ success: false, error: `Kimi API error: ${response.status}` });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(502).json({ success: false, error: 'Réponse vide de Kimi' });
        }

        const qualification = JSON.parse(content);
        res.json({ success: true, qualification });

    } catch (error) {
        console.error('Qualify error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Kimi AI - Batch qualify ALL leads in one API call
app.post('/api/qualify-all', async (req, res) => {
    const { conversations } = req.body;

    if (!KIMI_API_KEY) {
        return res.status(500).json({ success: false, error: 'KIMI_API_KEY non configurée' });
    }

    if (!conversations || !conversations.length) {
        return res.status(400).json({ success: false, error: 'Aucune conversation à analyser' });
    }

    // Build a summary of each conversation for Kimi
    const summaries = conversations.map((c, i) => {
        const msgs = (c.messages || []).slice(-6); // Last 6 messages max per conv
        const convText = msgs.map(m =>
            `${m.sender === 'me' ? 'Moi' : c.prospect_name}: ${m.content}`
        ).join('\n');
        return `--- Lead #${i + 1}: ${c.prospect_name} (id: ${c.id}) ---\n${convText || '(aucun message)'}`;
    }).join('\n\n');

    const systemPrompt = `Tu es un expert en sales B2B pour IFG (Intelligence Financière & Gestion). Analyse TOUTES les conversations LinkedIn ci-dessous et qualifie chaque lead.

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks). Un tableau JSON avec un objet par lead :
[
  {
    "id": "l'id de la conversation",
    "score": "hot" | "warm" | "cold",
    "action": "relance" | "répondre" | "attendre" | "archiver",
    "reason": "explication courte (1 phrase max)"
  }
]

Critères :
- "hot" : intérêt clair pour les services IFG, pose des questions, veut avancer
- "warm" : échange en cours, pas encore d'engagement fort mais potentiel
- "cold" : pas de réponse, réponse négative, ou conversation morte
- "relance" : le prospect n'a pas répondu, il faut relancer
- "répondre" : le dernier message vient du prospect, il attend une réponse
- "attendre" : on vient d'envoyer un message, laisser du temps
- "archiver" : conversation terminée ou prospect clairement pas intéressé

Analyse CHAQUE lead séparément. Renvoie exactement ${conversations.length} éléments dans le tableau.`;

    try {
        const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIMI_API_KEY}`
            },
            body: JSON.stringify({
                model: KIMI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: summaries }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Kimi batch error:', response.status, errText);
            return res.status(502).json({ success: false, error: `Kimi API error: ${response.status}` });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(502).json({ success: false, error: 'Réponse vide de Kimi' });
        }

        const results = JSON.parse(content);
        res.json({ success: true, results });

    } catch (error) {
        console.error('Qualify-all error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manual trigger endpoint
app.post('/scrape', async (req, res) => {
    try {
        console.log('🚀 Manual scrape triggered');
        const result = await scrapeLinkedIn();
        global.lastRun = new Date().toISOString();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('❌ Scrape error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cron disabled - scraper runs ONLY when clicking "Sync LinkedIn" button
// Uncomment below to enable automatic scraping every 6 hours:
// cron.schedule('0 */6 * * *', async () => {
//     console.log('⏰ Scheduled scrape started');
//     try {
//         await scrapeLinkedIn();
//         global.lastRun = new Date().toISOString();
//         console.log('✅ Scheduled scrape completed');
//     } catch (error) {
//         console.error('❌ Scheduled scrape failed:', error);
//     }
// });

app.listen(PORT, () => {
    console.log(`🔥 Scraper service running on port ${PORT}`);
    console.log('📅 Cron scheduled: every 6 hours');
});
