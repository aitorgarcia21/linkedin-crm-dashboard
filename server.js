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
                temperature: 1,
                max_tokens: 4096
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

// Generate a follow-up message for a conversation (called from dashboard detail panel)
app.post('/api/generate-message', async (req, res) => {
    const { prospect_name, conversation } = req.body;
    if (!prospect_name || !conversation) return res.status(400).json({ success: false, error: 'prospect_name and conversation required' });

    try {
        const prompt = `Tu écris un message LinkedIn de relance pour Aitor Garcia, fondateur d'IFG.

PROSPECT: ${prospect_name}
CONVERSATION:
${conversation}

QU'EST-CE QU'IFG:
IFG est un outil de recherche spécialisé en fiscalité. Un copilote qui aide avocats, experts-comptables et fiscalistes à trouver rapidement textes, jurisprudences et doctrines. Ce n'est pas un remplacement, c'est un accélérateur.

RÈGLES:
1. COURT : 2-3 phrases max. Comme un vrai message LinkedIn humain.
2. NATUREL : Pas de formules commerciales. Pas de robot.
3. PERSONNALISÉ : Reprends le fil de la conversation naturellement.
4. RESPECTUEUX : Jamais de pression, jamais de FOMO, jamais de manipulation.
5. PAS DE CHIFFRES INVENTÉS : Pas de "10-15h/semaine" ou "30 secondes".
6. PAS D'APPEL TÉLÉPHONIQUE.
7. VOUVOIEMENT toujours.
8. Signe "Aitor" à la fin.

Réponds UNIQUEMENT avec le message. Rien d'autre.`;

        const fetch = require('node-fetch');
        const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIMI_API_KEY}` },
            body: JSON.stringify({ model: KIMI_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 1, max_tokens: 1024 })
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(502).json({ success: false, error: `Kimi ${response.status}` });
        }

        const data = await response.json();
        const message = (data.choices[0].message.content || '').trim();
        res.json({ success: true, message });
    } catch (error) {
        console.error('Generate message error:', error);
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

// Converted prospects: cross-reference IFG auth.users + pre_registrations with LinkedIn prospects
app.get('/api/converted', async (req, res) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Pull IFG users, pre-registrations, and all prospects in parallel
        const [usersRes, preRegsRes, prospectsRes, analysesRes] = await Promise.all([
            supabase.rpc('get_auth_users').catch(() => ({ data: null })),
            supabase.from('pre_registrations').select('*'),
            supabase.from('prospects').select('id, name, company, job_title, sector, linkedin_url'),
            supabase.from('ai_analysis').select(`
                lead_score, lead_status, has_tested_ifg,
                conversations ( prospect_id, last_message_at, prospects (id, name, linkedin_url) )
            `).order('lead_score', { ascending: false })
        ]);

        // Build list of IFG registered emails/names
        const ifgUsers = [];
        
        // From pre_registrations (has email + name + payment info)
        const preRegs = preRegsRes.data || [];
        preRegs.forEach(pr => {
            ifgUsers.push({
                email: pr.email,
                name: pr.name || pr.email.split('@')[0],
                source: 'pre_registration',
                price_type: pr.price_type,
                status: pr.status,
                paid: !!pr.paid_at || !!pr.stripe_subscription_id,
                paid_at: pr.paid_at,
                stripe_id: pr.stripe_subscription_id,
                created_at: pr.created_at
            });
        });

        // From usage_logs (users who actually used IFG)
        const usageRes2 = await supabase.from('usage_logs').select('user_id, event_type, created_at').order('created_at', { ascending: false });
        const activeUserIds = new Set((usageRes2.data || []).map(u => u.user_id));

        // Cross-reference: find prospects who match IFG users by name
        const prospects = prospectsRes.data || [];
        const analyses = analysesRes.data || [];
        
        // Build analysis lookup by prospect_id
        const analysisLookup = {};
        analyses.forEach(a => {
            const pid = a.conversations?.prospect_id || a.conversations?.prospects?.id;
            if (pid) analysisLookup[pid] = a;
        });

        // Find converted prospects (has_tested_ifg = true in analysis)
        const converted = [];
        const subscribers = [];

        // Method 1: From AI analysis — has_tested_ifg flag
        analyses.forEach(a => {
            if (a.has_tested_ifg) {
                const p = a.conversations?.prospects;
                if (p) {
                    const matchedPreReg = preRegs.find(pr => {
                        const prName = (pr.name || '').toLowerCase();
                        const pName = (p.name || '').toLowerCase();
                        return prName && pName && (prName.includes(pName) || pName.includes(prName));
                    });
                    const entry = {
                        id: p.id,
                        name: p.name,
                        linkedin_url: p.linkedin_url,
                        lead_score: a.lead_score,
                        lead_status: a.lead_status,
                        last_message_at: a.conversations?.last_message_at,
                        registered: true,
                        paid: matchedPreReg?.paid || false,
                        paid_at: matchedPreReg?.paid_at,
                        price_type: matchedPreReg?.price_type,
                        source: matchedPreReg ? 'pre_registration' : 'ai_detected'
                    };
                    if (entry.paid) {
                        subscribers.push(entry);
                    } else {
                        converted.push(entry);
                    }
                }
            }
        });

        // Method 2: From pre_registrations — match by name with prospects
        preRegs.forEach(pr => {
            const prName = (pr.name || '').toLowerCase().trim();
            if (!prName) return;
            
            // Check if already found
            const alreadyFound = [...converted, ...subscribers].find(c => 
                c.name && c.name.toLowerCase().includes(prName)
            );
            if (alreadyFound) return;

            // Find matching prospect
            const matchedProspect = prospects.find(p => {
                const pName = (p.name || '').toLowerCase();
                return pName.includes(prName) || prName.includes(pName);
            });

            if (matchedProspect) {
                const analysis = analysisLookup[matchedProspect.id];
                const entry = {
                    id: matchedProspect.id,
                    name: matchedProspect.name,
                    company: matchedProspect.company,
                    job_title: matchedProspect.job_title,
                    linkedin_url: matchedProspect.linkedin_url,
                    lead_score: analysis?.lead_score || 0,
                    lead_status: analysis?.lead_status || 'unknown',
                    registered: true,
                    paid: !!pr.paid_at || !!pr.stripe_subscription_id,
                    paid_at: pr.paid_at,
                    price_type: pr.price_type,
                    email: pr.email,
                    source: 'pre_registration'
                };
                if (entry.paid) {
                    subscribers.push(entry);
                } else {
                    converted.push(entry);
                }
            }
        });

        res.json({
            success: true,
            converted: converted.sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0)),
            subscribers: subscribers.sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0)),
            summary: {
                total_converted: converted.length,
                total_subscribers: subscribers.length,
                total_ifg_users: preRegs.length,
                total_prospects: prospects.length
            }
        });

    } catch (error) {
        console.error('❌ Converted API error:', error);
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

        // LINKIFG pipeline DB
        const supabaseUrl = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // IFG product DB (real users, conversations, usage)
        const ifgUrl = process.env.IFG_SUPABASE_URL || 'https://cgfygltnpopoayfoplyv.supabase.co';
        const ifgKey = process.env.IFG_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZnlnbHRucG9wb2F5Zm9wbHl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODY5NjQsImV4cCI6MjA3NDc2Mjk2NH0.0QQi7wWLzoph-oHUrapzxkYspAP7VXfgedUxjV-A4Vo';
        const ifgDb = createClient(ifgUrl, ifgKey);

        // === PULL ALL DATA IN PARALLEL (both DBs) ===
        const [
            analysesRes, prospectsRes, conversationsRes,
            messagesCountRes, followUpsRes,
            // IFG product data
            ifgProfilesRes, ifgUsersRes, ifgConvsRes, ifgMsgsCountRes, ifgQuotasRes, ifgSubscriptionsRes
        ] = await Promise.all([
            supabase.from('ai_analysis').select(`
                lead_score, lead_status, sentiment, interest_level, has_tested_ifg, reasoning, recommended_action, follow_up_timing, personalization_hints,
                conversations ( id, last_message_at, last_message_by, engagement_level, status,
                    prospects (name, company, job_title, sector, location, linkedin_url) )
            `).neq('recommended_action', 'ignore').order('lead_score', { ascending: false }).limit(100),
            supabase.from('prospects').select('id, name, company, job_title, sector, persona_type, location').limit(200),
            supabase.from('conversations').select('id, engagement_level, status, last_message_at, last_message_by').order('last_message_at', { ascending: false }).limit(100),
            supabase.from('messages').select('id', { count: 'exact', head: true }),
            supabase.from('follow_up_messages').select('id, status, generated_message, created_at').order('created_at', { ascending: false }).limit(20),
            // IFG product queries
            ifgDb.from('profiles').select('id, email, first_name, last_name, role, company, created_at, abuse_detected'),
            ifgDb.from('users').select('id, email, full_name, tier, stripe_customer_id, stripe_subscription_id, subscription_status, questions_used, questions_limit, created_at'),
            ifgDb.from('conversations').select('id, user_id, title, country, status, created_at').order('created_at', { ascending: false }).limit(50),
            ifgDb.from('messages').select('id', { count: 'exact', head: true }),
            ifgDb.from('user_quotas').select('user_id, requests_count, tokens_used, requests_simple, requests_complex, last_request_at').order('last_request_at', { ascending: false }).limit(20),
            ifgDb.from('subscriptions').select('id, user_id, plan_type, status, current_period_start, current_period_end, cancel_at_period_end').catch(() => ({ data: [] }))
        ]);

        const analyses = analysesRes.data || [];
        const prospects = prospectsRes.data || [];
        const conversations = conversationsRes.data || [];
        const totalMessages = messagesCountRes.count || 0;
        const followUps = followUpsRes.data || [];

        // IFG product data
        const ifgProfiles = ifgProfilesRes.data || [];
        const ifgUsers = ifgUsersRes.data || [];
        const ifgConvs = ifgConvsRes.data || [];
        const ifgTotalMsgs = ifgMsgsCountRes.count || 0;
        const ifgQuotas = ifgQuotasRes.data || [];
        const ifgSubs = (ifgSubscriptionsRes?.data) || [];

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
            return `  • ${p?.name || '?'} (${p?.job_title || '?'} @ ${p?.company || '?'}) | Score: ${a.lead_score} | Timing: ${a.follow_up_timing} | Testé: ${a.has_tested_ifg ? 'OUI' : 'non'}`;
        }).join('\n');

        const warmDetail = warmLeads.slice(0, 10).map(a => {
            const p = a.conversations?.prospects;
            return `  • ${p?.name || '?'} (${p?.job_title || '?'} @ ${p?.company || '?'}) | Score: ${a.lead_score}`;
        }).join('\n');

        // IFG product stats
        const ifgPremium = ifgUsers.filter(u => u.tier === 'premium' || u.subscription_status === 'active');
        const ifgFree = ifgUsers.filter(u => u.tier === 'free' || !u.tier);
        const ifgActiveQuotas = ifgQuotas.filter(q => q.requests_count > 0);
        const totalIFGQuestions = ifgQuotas.reduce((s, q) => s + (q.requests_count || 0), 0);
        const totalIFGTokens = ifgQuotas.reduce((s, q) => s + (q.tokens_used || 0), 0);

        const ifgUsersList = ifgProfiles.slice(0, 20).map(p => 
            `  • ${p.first_name || ''} ${p.last_name || ''} (${p.email}) | Rôle: ${p.role} | Entreprise: ${p.company || '-'} | Inscrit: ${new Date(p.created_at).toLocaleDateString('fr-FR')}`
        ).join('\n');

        const ifgSubsList = ifgSubs.filter(s => s.status === 'active').map(s =>
            `  • User: ${s.user_id} | Plan: ${s.plan_type} | Status: ${s.status} | Fin: ${s.current_period_end}`
        ).join('\n');

        const systemPrompt = `Tu es KIMI, l'assistant IA stratégique d'Aitor Garcia, fondateur d'IFG (copilote IA pour la recherche fiscale).
Tu as accès en temps réel à TOUTES les données de son business : pipeline LinkedIn ET produit IFG.

═══════════════════════════════════════
📊 PIPELINE LINKEDIN LINKIFG
═══════════════════════════════════════
Total prospects LinkedIn: ${prospects.length}
Total conversations LinkedIn: ${conversations.length}
Total messages LinkedIn: ${totalMessages}
Messages IA générés: ${followUps.length} (${followUps.filter(f => f.status === 'approved').length} approuvés)

LEADS:
- 🔥 Hot: ${hotLeads.length}
- 🌡️ Warm: ${warmLeads.length}
- ❄️ Cold: ${coldLeads.length}
- ✅ Ont testé IFG: ${testedIFG.length}
- 📬 Besoin follow-up: ${needsFollowUp.length}

ENGAGEMENT:
${Object.entries(engagementMap).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

SECTEURS:
${Object.entries(sectorMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

TOP PROFILS:
${topTitles.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

🔥 HOT LEADS:
${topLeadsDetail || 'Aucun'}

🌡️ WARM LEADS:
${warmDetail || 'Aucun'}

═══════════════════════════════════════
� IFG PRODUIT (Supabase IFG - données réelles)
═══════════════════════════════════════
Utilisateurs inscrits (profiles): ${ifgProfiles.length}
Utilisateurs (table users): ${ifgUsers.length}
- Premium/Payants: ${ifgPremium.length}
- Free: ${ifgFree.length}
Conversations IFG (questions posées): ${ifgConvs.length}
Messages IFG total: ${ifgTotalMsgs}
Questions totales (quotas): ${totalIFGQuestions}
Tokens consommés: ${totalIFGTokens.toLocaleString()}
Utilisateurs actifs (ont posé des questions): ${ifgActiveQuotas.length}
Abonnements actifs: ${ifgSubs.filter(s => s.status === 'active').length}

UTILISATEURS IFG:
${ifgUsersList || 'Aucun utilisateur'}

${ifgSubsList ? `ABONNEMENTS ACTIFS:\n${ifgSubsList}` : ''}

DERNIÈRE ACTIVITÉ IFG:
${ifgQuotas.slice(0, 5).map(q => `  • User ${q.user_id?.slice(0,8)}... | ${q.requests_count} requêtes (${q.requests_simple} simples, ${q.requests_complex} complexes) | ${q.tokens_used} tokens | Dernier: ${q.last_request_at ? new Date(q.last_request_at).toLocaleString('fr-FR') : '-'}`).join('\n') || 'Aucune activité'}

═══════════════════════════════════════
INSTRUCTIONS:
- Réponds TOUJOURS en français, concis et actionnable
- Tu as accès aux DEUX bases: LINKIFG (pipeline LinkedIn) et IFG (produit, vrais users)
- Quand on demande "combien de users", donne les chiffres IFG produit (profiles + users)
- Utilise la psychologie de vente (Challenger Sale, SPIN, Loss Aversion) pour les messages
- Séquences YC: hot (12j/5 steps), warm (17j/5 steps), cold (21j/4 steps)
- IFG = copilote IA recherche fiscale, cible = avocats fiscalistes, experts-comptables
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
                temperature: 1,
                max_tokens: 4096
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
                ifg_users: ifgProfiles.length,
                ifg_conversations: ifgConvs.length
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
