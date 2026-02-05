const express = require('express');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();
const { scrapeLinkedIn } = require('./scrape');
const { 
    processConversationsWithAI, 
    getDailyFollowUpList, 
    approveFollowUpMessage, 
    rejectFollowUpMessage,
    getHotLeadsList
} = require('./ai-workflow');
const {
    getSequenceAnalytics,
    getSequenceRecommendations,
    createABTest,
    getABTestResults,
    trackMessagePerformance
} = require('./analytics-engine');

const app = express();
const PORT = process.env.PORT || 3000;

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.5';

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

// Debug: check env vars (masked)
app.get('/debug-env', (req, res) => {
    const mask = (v) => v ? v.slice(0, 6) + '...' + v.slice(-4) : 'NOT SET';
    res.json({
        KIMI_API_KEY: mask(process.env.KIMI_API_KEY),
        KIMI_BASE_URL: process.env.KIMI_BASE_URL || 'NOT SET (default: https://api.moonshot.ai/v1)',
        KIMI_MODEL: process.env.KIMI_MODEL || 'NOT SET (default: kimi-k2.5)',
        SUPABASE_URL: mask(process.env.SUPABASE_URL),
        SUPABASE_ANON_KEY: mask(process.env.SUPABASE_ANON_KEY),
        SUPABASE_KEY: mask(process.env.SUPABASE_KEY),
        NODE_ENV: process.env.NODE_ENV || 'NOT SET'
    });
});

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

// AI Analysis endpoint
app.post('/analyze', async (req, res) => {
    try {
        console.log('🤖 AI analysis triggered');
        const result = await processConversationsWithAI();
        res.json(result);
    } catch (error) {
        console.error('❌ Analysis error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get daily follow-up list
app.get('/api/follow-ups', async (req, res) => {
    try {
        const result = await getDailyFollowUpList();
        res.json(result);
    } catch (error) {
        console.error('❌ Error fetching follow-ups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Approve follow-up message
app.post('/api/follow-ups/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { edited_message } = req.body;
        const result = await approveFollowUpMessage(id, edited_message);
        res.json(result);
    } catch (error) {
        console.error('❌ Error approving message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject follow-up message
app.post('/api/follow-ups/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await rejectFollowUpMessage(id);
        res.json(result);
    } catch (error) {
        console.error('❌ Error rejecting message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Analytics endpoints
app.get('/api/analytics', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '30_days';
        const result = await getSequenceAnalytics(timeframe);
        res.json(result);
    } catch (error) {
        console.error('❌ Analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/analytics/recommendations/:prospectId', async (req, res) => {
    try {
        const result = await getSequenceRecommendations(req.params.prospectId);
        res.json(result);
    } catch (error) {
        console.error('❌ Recommendation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/analytics/track', async (req, res) => {
    try {
        const { message_id, event, metadata } = req.body;
        const result = await trackMessagePerformance(message_id, event, metadata);
        res.json(result);
    } catch (error) {
        console.error('❌ Tracking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ab-tests', async (req, res) => {
    try {
        const { base_message_id, variants } = req.body;
        const result = await createABTest(base_message_id, variants);
        res.json(result);
    } catch (error) {
        console.error('❌ A/B test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ab-tests/:id/results', async (req, res) => {
    try {
        const result = await getABTestResults(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('❌ A/B test results error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Hot leads list - sorted by priority, who to contact first
app.get('/api/hot-leads', async (req, res) => {
    try {
        const result = await getHotLeadsList();
        res.json(result);
    } catch (error) {
        console.error('❌ Hot leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Auto-sync: every hour, scrape new messages + re-analyze + generate lists
let isSyncing = false;
async function autoSync() {
    if (isSyncing) {
        console.log('⏳ Sync already running, skipping...');
        return;
    }
    isSyncing = true;
    try {
        console.log('\n🔄 === AUTO-SYNC STARTED ===');
        console.log('📅 ' + new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));

        // Step 1: Scrape new LinkedIn messages
        console.log('\n📬 Step 1: Scraping new LinkedIn messages...');
        const scrapeResult = await scrapeLinkedIn();
        global.lastRun = new Date().toISOString();
        console.log(`✅ Scrape done: ${scrapeResult.scraped} conversations, ${scrapeResult.saved} saved`);

        // Step 2: AI analysis on all conversations (skips recently analyzed)
        console.log('\n🤖 Step 2: Running AI analysis...');
        const analysisResult = await processConversationsWithAI();
        console.log(`✅ Analysis done: ${analysisResult.results?.analyzed || 0} analyzed, ${analysisResult.results?.hot_leads || 0} hot leads`);

        console.log('\n✅ === AUTO-SYNC COMPLETE ===\n');
    } catch (error) {
        console.error('❌ Auto-sync error:', error.message);
    } finally {
        isSyncing = false;
    }
}

// Schedule: every hour at minute 0
cron.schedule('0 * * * *', autoSync);

// Manual sync endpoint (also used by dashboard button)
app.post('/auto-sync', async (req, res) => {
    try {
        autoSync(); // Fire and forget
        res.json({ success: true, message: 'Auto-sync started in background' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 Scraper service running on port ${PORT}`);
    console.log('📅 Auto-sync scheduled: every hour');
    console.log('🔥 Hot leads list available at /api/hot-leads');
});
