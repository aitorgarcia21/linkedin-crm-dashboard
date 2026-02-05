const express = require('express');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();
const { scrapeLinkedIn } = require('./scrape');
const { createClient } = require('@supabase/supabase-js');
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
const { buildContactTodayList, SEQUENCES } = require('./outreach-sequences');

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

// Full sync + analysis + contact list (one-click from dashboard)
app.post('/api/full-analysis', async (req, res) => {
    try {
        const steps = [];
        const start = Date.now();

        // Step 1: Smart scrape (only new messages)
        steps.push({ step: 'scrape', status: 'running', started: Date.now() });
        console.log('🔄 Full analysis: Step 1 - Smart scraping...');
        const scrapeResult = await scrapeLinkedIn(false); // false = smart mode
        steps[0].status = 'done';
        steps[0].result = { scraped: scrapeResult.scraped, saved: scrapeResult.saved };
        steps[0].duration = Date.now() - steps[0].started;

        // Step 2: AI Analysis
        steps.push({ step: 'ai_analysis', status: 'running', started: Date.now() });
        console.log('🤖 Full analysis: Step 2 - Kimi K2.5 analysis...');
        const analysisResult = await processConversationsWithAI();
        steps[1].status = 'done';
        steps[1].result = analysisResult.results || {};
        steps[1].duration = Date.now() - steps[1].started;

        // Step 3: Build contact list
        steps.push({ step: 'contact_list', status: 'running', started: Date.now() });
        console.log('📋 Full analysis: Step 3 - Building contact list...');
        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const contactList = await buildContactTodayList(supabase);
        steps[2].status = 'done';
        steps[2].result = contactList.summary || {};
        steps[2].duration = Date.now() - steps[2].started;

        global.lastRun = new Date().toISOString();

        res.json({
            success: true,
            total_duration_ms: Date.now() - start,
            steps,
            report: {
                conversations_scraped: scrapeResult.scraped || 0,
                new_messages_saved: scrapeResult.saved || 0,
                conversations_analyzed: analysisResult.results?.analyzed || 0,
                hot_leads: analysisResult.results?.hot_leads || 0,
                warm_leads: analysisResult.results?.warm_leads || 0,
                cold_leads: analysisResult.results?.cold_leads || 0,
                errors: analysisResult.results?.errors || 0,
                contact_today: contactList.summary?.contact_today || 0,
                contact_soon: contactList.summary?.contact_soon || 0,
                sequence_complete: contactList.summary?.sequence_complete || 0
            }
        });
    } catch (error) {
        console.error('❌ Full analysis error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Kimi Chatbot - connected to ALL Supabase data (LINKIFG pipeline + IFG product)
app.post('/api/kimi-chat', async (req, res) => {
    try {
        const { question, history } = req.body;
        if (!question) return res.status(400).json({ success: false, error: 'Question requise' });

        const kimiKey = process.env.KIMI_API_KEY || 'sk-c7WDIB5Ryc59fJdmNN7kjcdiPljD0gzYvOlPRRLCwRkbp1mb';
        const kimiUrl = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
        const kimiModel = process.env.KIMI_MODEL || 'kimi-k2.5';

        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // === PULL ALL DATA IN PARALLEL ===
        const [
            analysesRes, contactListRes, prospectsRes, conversationsRes,
            messagesCountRes, preRegsRes, usageRes, followUpsRes
        ] = await Promise.all([
            supabase.from('ai_analysis').select(`
                lead_score, lead_status, sentiment, interest_level, has_tested_ifg, reasoning, recommended_action, follow_up_timing, personalization_hints,
                conversations ( id, last_message_at, last_message_by, engagement_level, status,
                    prospects (name, company, job_title, sector, location, linkedin_url) )
            `).neq('recommended_action', 'ignore').order('lead_score', { ascending: false }).limit(100),
            buildContactTodayList(supabase),
            supabase.from('prospects').select('id, name, company, job_title, sector, persona_type, location').limit(200),
            supabase.from('conversations').select('id, engagement_level, status, last_message_at, last_message_by').order('last_message_at', { ascending: false }).limit(100),
            supabase.from('messages').select('id', { count: 'exact', head: true }),
            supabase.from('pre_registrations').select('id, email, name, price_type, status, created_at'),
            supabase.from('usage_logs').select('id, event_type, tokens_used, model_used, created_at').order('created_at', { ascending: false }).limit(20),
            supabase.from('follow_up_messages').select('id, status, generated_message, created_at').order('created_at', { ascending: false }).limit(20)
        ]);

        const analyses = analysesRes.data || [];
        const contactList = contactListRes;
        const prospects = prospectsRes.data || [];
        const conversations = conversationsRes.data || [];
        const totalMessages = messagesCountRes.count || 0;
        const preRegs = preRegsRes.data || [];
        const usageLogs = usageRes.data || [];
        const followUps = followUpsRes.data || [];

        // === BUILD RICH CONTEXT ===
        const hotLeads = analyses.filter(a => a.lead_status === 'hot');
        const warmLeads = analyses.filter(a => a.lead_status === 'warm');
        const coldLeads = analyses.filter(a => a.lead_status === 'cold');
        const testedIFG = analyses.filter(a => a.has_tested_ifg);
        const needsFollowUp = analyses.filter(a => a.recommended_action === 'follow_up');

        // Engagement breakdown
        const engagementMap = {};
        conversations.forEach(c => { engagementMap[c.engagement_level] = (engagementMap[c.engagement_level] || 0) + 1; });

        // Sector breakdown
        const sectorMap = {};
        prospects.forEach(p => { if (p.sector) sectorMap[p.sector] = (sectorMap[p.sector] || 0) + 1; });

        // Job title breakdown
        const titleMap = {};
        prospects.forEach(p => { if (p.job_title) titleMap[p.job_title] = (titleMap[p.job_title] || 0) + 1; });
        const topTitles = Object.entries(titleMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

        // Top leads detail
        const topLeadsDetail = hotLeads.slice(0, 15).map(a => {
            const p = a.conversations?.prospects;
            return `  • ${p?.name || '?'} (${p?.job_title || '?'} @ ${p?.company || '?'}, ${p?.sector || '?'}) | Score: ${a.lead_score} | Intérêt: ${a.interest_level} | Timing: ${a.follow_up_timing} | Testé: ${a.has_tested_ifg ? 'OUI' : 'non'} | ${a.reasoning}`;
        }).join('\n');

        const warmDetail = warmLeads.slice(0, 10).map(a => {
            const p = a.conversations?.prospects;
            return `  • ${p?.name || '?'} (${p?.job_title || '?'} @ ${p?.company || '?'}) | Score: ${a.lead_score} | ${a.reasoning}`;
        }).join('\n');

        const todayList = (contactList.lists?.contact_today || []).slice(0, 25).map(l =>
            `  • ${l.name} (${l.job_title} @ ${l.company}) | Prio: ${l.priority}/100 | Séq: ${l.sequence_key} step ${l.sequence_step}/${l.sequence_total} | Style: ${l.message_style} | Psycho: ${l.sequence_psychology} | ${l.reason}`
        ).join('\n');

        const preRegsList = preRegs.map(r => `  • ${r.name || r.email} | Plan: ${r.price_type} | Status: ${r.status} | ${r.created_at}`).join('\n');

        const systemPrompt = `Tu es KIMI, l'assistant IA stratégique d'Aitor Garcia, fondateur d'IFG (copilote IA pour la recherche fiscale).
Tu as accès en temps réel à TOUTES les données de son business.

═══════════════════════════════════════
📊 DASHBOARD PIPELINE LINKEDIN (temps réel)
═══════════════════════════════════════
Total prospects: ${prospects.length}
Total conversations: ${conversations.length}
Total messages échangés: ${totalMessages}
Messages IA générés: ${followUps.length} (${followUps.filter(f => f.status === 'approved').length} approuvés, ${followUps.filter(f => f.status === 'sent').length} envoyés)

RÉPARTITION LEADS:
- 🔥 Hot leads: ${hotLeads.length}
- 🟡 Warm leads: ${warmLeads.length}
- 🔵 Cold leads: ${coldLeads.length}
- ✅ Ont testé IFG: ${testedIFG.length}
- 📬 Besoin follow-up: ${needsFollowUp.length}

ENGAGEMENT:
${Object.entries(engagementMap).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

SECTEURS:
${Object.entries(sectorMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

TOP PROFILS CIBLÉS:
${topTitles.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

═══════════════════════════════════════
🔥 TOP HOT LEADS (détail):
${topLeadsDetail || 'Aucun hot lead pour le moment'}

🟡 WARM LEADS:
${warmDetail || 'Aucun warm lead'}

═══════════════════════════════════════
🎯 CONTACTER AUJOURD'HUI (${contactList.summary?.contact_today || 0}):
${todayList || 'Aucun prospect à contacter aujourd\'hui'}

📅 Bientôt (< 3j): ${contactList.summary?.contact_soon || 0}
✅ Séquences terminées: ${contactList.summary?.sequence_complete || 0}

═══════════════════════════════════════
💰 IFG BUSINESS DATA:
Pré-inscriptions: ${preRegs.length}
${preRegsList || 'Aucune pré-inscription'}

Usage API IFG (derniers logs):
${usageLogs.slice(0, 5).map(l => `- ${l.event_type}: ${l.tokens_used} tokens (${l.model_used}) @ ${l.created_at}`).join('\n') || 'Aucun log'}

═══════════════════════════════════════
INSTRUCTIONS:
- Réponds TOUJOURS en français
- Sois concis, stratégique et actionnable
- Utilise les données pour donner des conseils personnalisés
- Si on te demande un message, utilise la psychologie de vente (Challenger Sale, SPIN, Loss Aversion)
- Tu peux analyser les patterns, suggérer des priorités, rédiger des messages
- Tu connais les séquences YC: hot (12j/5 steps), warm (17j/5 steps), cold (21j/4 steps)
- Heures optimales: 8h-10h et 14h-16h, Mardi-Jeudi
- IFG = copilote IA recherche fiscale, cible = avocats fiscalistes, experts-comptables, directeurs fiscaux
- Offre: 5 questions gratuites pour tester`;

        const fetch = require('node-fetch');
        
        // Build messages with history
        const chatMessages = [{ role: 'system', content: systemPrompt }];
        if (history && Array.isArray(history)) {
            history.slice(-6).forEach(h => {
                chatMessages.push({ role: h.role, content: h.content });
            });
        }
        chatMessages.push({ role: 'user', content: question });

        const response = await fetch(`${kimiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${kimiKey}`
            },
            body: JSON.stringify({
                model: kimiModel,
                messages: chatMessages,
                temperature: 0.5,
                max_tokens: 3000
            })
        });

        if (!response.ok) throw new Error(`Kimi API error: ${response.status}`);

        const data = await response.json();
        const answer = data.choices[0].message.content || '';

        res.json({ 
            success: true, 
            answer, 
            model: kimiModel,
            context_size: {
                prospects: prospects.length,
                analyses: analyses.length,
                messages: totalMessages,
                contact_today: contactList.summary?.contact_today || 0
            }
        });
    } catch (error) {
        console.error('❌ Kimi chat error:', error);
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

// Contact today list - YC-optimized sequence-based daily list
app.get('/api/contact-today', async (req, res) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const result = await buildContactTodayList(supabase);
        res.json(result);
    } catch (error) {
        console.error('❌ Contact today error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get sequence definitions
app.get('/api/sequences', (req, res) => {
    res.json({ success: true, sequences: SEQUENCES });
});

// Auto-sync: scrape new messages + AI analysis + build contact lists
let isSyncing = false;
async function autoSync() {
    if (isSyncing) {
        console.log('⏳ Sync already running, skipping...');
        return;
    }
    isSyncing = true;
    try {
        const parisTime = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
        console.log(`\n🔄 === AUTO-SYNC STARTED === ${parisTime}`);

        // Step 1: Scrape new LinkedIn messages (only new ones)
        console.log('\n📬 Step 1: Scraping new LinkedIn messages...');
        const scrapeResult = await scrapeLinkedIn();
        global.lastRun = new Date().toISOString();
        console.log(`✅ Scrape done: ${scrapeResult.scraped} conversations, ${scrapeResult.saved} saved`);

        // Step 2: AI analysis on conversations (skips recently analyzed <24h)
        console.log('\n🤖 Step 2: Running Kimi K2.5 AI analysis...');
        const analysisResult = await processConversationsWithAI();
        console.log(`✅ Analysis done: ${analysisResult.results?.analyzed || 0} analyzed, ${analysisResult.results?.hot_leads || 0} hot leads`);

        // Step 3: Build contact today list based on sequences
        console.log('\n📋 Step 3: Building contact list...');
        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const contactList = await buildContactTodayList(supabase);
        console.log(`✅ Contact list: ${contactList.summary?.contact_today || 0} à contacter aujourd'hui, ${contactList.summary?.contact_soon || 0} bientôt`);

        console.log(`\n✅ === AUTO-SYNC COMPLETE === ${parisTime}\n`);
    } catch (error) {
        console.error('❌ Auto-sync error:', error.message);
    } finally {
        isSyncing = false;
    }
}

// Schedule: 8h00 and 15h00 Paris time (UTC+1/+2)
// 8h Paris = 7h UTC (winter) / 6h UTC (summer)
// 15h Paris = 14h UTC (winter) / 13h UTC (summer)
// Using both to cover DST: 6,7 for 8h and 13,14 for 15h
cron.schedule('0 6,7 * * *', () => {
    const parisHour = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false });
    if (parseInt(parisHour) === 8) autoSync();
});
cron.schedule('0 13,14 * * *', () => {
    const parisHour = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false });
    if (parseInt(parisHour) === 15) autoSync();
});

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
