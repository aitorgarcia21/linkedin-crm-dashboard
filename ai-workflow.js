const { createClient } = require('@supabase/supabase-js');
const { analyzeConversation, generateFollowUpMessage } = require('./ai-analyzer');
const { 
    getOptimalTiming, 
    analyzeResponsePattern, 
    calculateMessagePriority,
    getNextSequenceMessage 
} = require('./outreach-sequences');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

/**
 * Process conversations with AI analysis and generate follow-up messages
 */
async function processConversationsWithAI() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const BATCH_SIZE = 10;
    
    console.log('🤖 Starting AI analysis workflow...');
    
    // Get conversations + existing analyses in ONE query (no N+1)
    const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
            id, linkedin_conversation_id, prospect_id, last_message_at,
            prospects ( id, name, linkedin_url, job_title, company, location, sector ),
            messages ( sender, content, timestamp ),
            ai_analysis ( analyzed_at, recommended_action )
        `)
        .order('last_message_at', { ascending: false })
        .limit(200);

    if (convError) {
        console.error('❌ Error fetching conversations:', convError);
        return { success: false, error: convError };
    }

    // IFG keywords — if NO message contains any of these, conversation is irrelevant
    const IFG_KEYWORDS = ['ifg', 'ifg.tax', 'recherche fiscale', 'fiscalité', 'fiscal', 'copilote',
        'moteur de recherche', 'bofip', 'cgi', 'jurisprudence', 'doctrine', 'expert-comptable',
        'avocat fiscaliste', 'droit fiscal', '195 juridictions', 'aitor'];

    function isRelevantConversation(msgs) {
        const allText = msgs.map(m => (m.content || '').toLowerCase()).join(' ');
        return IFG_KEYWORDS.some(kw => allText.includes(kw));
    }

    // Pre-filter: delete irrelevant conversations BEFORE wasting Kimi API calls
    const now = Date.now();
    let deletedCount = 0;
    for (const conv of conversations) {
        const msgs = conv.messages || [];
        if (msgs.length > 0 && !isRelevantConversation(msgs)) {
            // Not about IFG at all → DELETE from DB
            await supabase.from('follow_up_messages').delete().eq('conversation_id', conv.id);
            await supabase.from('ai_analysis').delete().eq('conversation_id', conv.id);
            await supabase.from('messages').delete().eq('conversation_id', conv.id);
            await supabase.from('conversations').delete().eq('id', conv.id);
            deletedCount++;
        }
    }
    if (deletedCount > 0) console.log(`🗑️ ${deletedCount} conversations hors-sujet supprimées`);

    // Filter: skip no-messages, already analyzed <24h, already ignored
    const remaining = conversations.filter(conv => {
        const msgs = conv.messages || [];
        if (msgs.length === 0) return false;
        if (!conv.prospects?.name) return false;
        if (!isRelevantConversation(msgs)) return false; // already deleted above, but safety check
        
        const existing = Array.isArray(conv.ai_analysis) ? conv.ai_analysis[0] : conv.ai_analysis;
        if (existing?.analyzed_at) {
            const hours = (now - new Date(existing.analyzed_at).getTime()) / 3600000;
            if (hours < 24) return false;
        }
        if (existing?.recommended_action === 'ignore') return false;
        return true;
    });

    const toAnalyze = remaining;
    console.log(`📊 ${conversations.length} conversations, ${toAnalyze.length} à analyser (${deletedCount} supprimées, ${conversations.length - toAnalyze.length - deletedCount} skip)`);

    if (toAnalyze.length === 0) {
        console.log('✅ Rien à analyser !');
        return { success: true, results: { analyzed: 0, hot_leads: 0, warm_leads: 0, cold_leads: 0, messages_generated: 0, errors: 0 } };
    }

    const results = { analyzed: 0, hot_leads: 0, warm_leads: 0, cold_leads: 0, messages_generated: 0, errors: 0 };

    // Process in batches of BATCH_SIZE in parallel
    for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
        const batch = toAnalyze.slice(i, i + BATCH_SIZE);
        console.log(`\n⚡ Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(toAnalyze.length/BATCH_SIZE)} (${batch.length} profils en parallèle)...`);
        const startTime = Date.now();

        const batchResults = await Promise.allSettled(
            batch.map(conv => analyzeOneConversation(supabase, conv, results))
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const ok = batchResults.filter(r => r.status === 'fulfilled' && r.value).length;
        const fail = batchResults.filter(r => r.status === 'rejected').length;
        console.log(`   ✅ Batch done in ${elapsed}s (${ok} ok, ${fail} errors)`);
    }

    console.log('\n📈 AI Analysis Summary:');
    console.log(`   Analyzed: ${results.analyzed}`);
    console.log(`   🔥 Hot: ${results.hot_leads} | 🌡️ Warm: ${results.warm_leads} | ❄️ Cold: ${results.cold_leads}`);
    console.log(`   ✉️  Messages: ${results.messages_generated} | ⚠️ Errors: ${results.errors}`);

    return { success: true, results };
}

/**
 * Analyze a single conversation (called in parallel within a batch)
 */
async function analyzeOneConversation(supabase, conv, results) {
    const prospect = conv.prospects;
    const messages = conv.messages || [];

    try {
        const { success, analysis } = await analyzeConversation(prospect.name, messages);

        if (!success) {
            console.log(`   ⚠️ ${prospect.name}: failed`);
            results.errors++;
            return false;
        }

        // Irrelevant → DELETE entirely
        if (analysis.is_relevant === false) {
            console.log(`   �️ ${prospect.name}: non pertinent → supprimé`);
            await supabase.from('follow_up_messages').delete().eq('conversation_id', conv.id);
            await supabase.from('ai_analysis').delete().eq('conversation_id', conv.id);
            await supabase.from('messages').delete().eq('conversation_id', conv.id);
            await supabase.from('conversations').delete().eq('id', conv.id);
            results.analyzed++;
            return true;
        }

        console.log(`   📊 ${prospect.name}: ${analysis.lead_score}/100 (${analysis.lead_status}) → ${analysis.recommended_action}`);

        // Save analysis
        const { data: savedAnalysis, error: analysisError } = await supabase
            .from('ai_analysis')
            .upsert({
                conversation_id: conv.id,
                lead_score: analysis.lead_score, lead_status: analysis.lead_status,
                sentiment: analysis.sentiment, interest_level: analysis.interest_level,
                has_tested_ifg: analysis.has_tested_ifg, key_points: analysis.key_points,
                recommended_action: analysis.recommended_action,
                follow_up_timing: analysis.follow_up_timing,
                personalization_hints: analysis.personalization_hints,
                reasoning: analysis.reasoning, analyzed_at: new Date().toISOString()
            }, { onConflict: 'conversation_id' })
            .select().single();

        if (analysisError) { results.errors++; return false; }

        results.analyzed++;
        if (analysis.lead_status === 'hot') results.hot_leads++;
        else if (analysis.lead_status === 'warm') results.warm_leads++;
        else results.cold_leads++;

        // Generate follow-up if needed
        if (analysis.recommended_action === 'follow_up') {
            const ifgStatus = { has_tested: analysis.has_tested_ifg, is_subscriber: false };
            const profileData = { job_title: prospect.job_title, company: prospect.company, location: prospect.location, sector: prospect.sector };

            const { success: msgSuccess, message } = await generateFollowUpMessage(
                prospect.name, profileData, messages, analysis, ifgStatus
            );

            if (msgSuccess && savedAnalysis) {
                const { error: msgError } = await supabase.from('follow_up_messages').insert({
                    conversation_id: conv.id, ai_analysis_id: savedAnalysis.id,
                    generated_message: message, status: 'pending'
                });
                if (!msgError) results.messages_generated++;
            }
        }

        return true;
    } catch (error) {
        console.error(`   ❌ ${prospect?.name}: ${error.message}`);
        results.errors++;
        return false;
    }
}

/**
 * Get daily follow-up list (pending messages for approval)
 */
async function getDailyFollowUpList() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase
        .from('follow_up_messages')
        .select(`
            id,
            generated_message,
            edited_message,
            status,
            created_at,
            conversation_id,
            conversations (
                id,
                linkedin_conversation_id,
                prospects (
                    name,
                    linkedin_url,
                    job_title,
                    company
                )
            ),
            ai_analysis (
                lead_score,
                lead_status,
                sentiment,
                key_points
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        return { success: false, error };
    }

    return {
        success: true,
        followUps: data
    };
}

/**
 * Approve and optionally edit a follow-up message
 */
async function approveFollowUpMessage(messageId, editedMessage = null) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const updateData = {
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'Aitor Garcia'
    };

    if (editedMessage) {
        updateData.edited_message = editedMessage;
    }

    const { data, error } = await supabase
        .from('follow_up_messages')
        .update(updateData)
        .eq('id', messageId)
        .select()
        .single();

    if (error) {
        return { success: false, error };
    }

    return { success: true, message: data };
}

/**
 * Reject a follow-up message
 */
async function rejectFollowUpMessage(messageId) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase
        .from('follow_up_messages')
        .update({ status: 'rejected' })
        .eq('id', messageId)
        .select()
        .single();

    if (error) {
        return { success: false, error };
    }

    return { success: true, message: data };
}

/**
 * Get hot leads list - sorted by priority, who to contact first
 * Returns categorized lists: urgent, today, this_week
 */
async function getHotLeadsList() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Get all conversations with their latest AI analysis
    const { data: analyses, error } = await supabase
        .from('ai_analysis')
        .select(`
            id,
            lead_score,
            lead_status,
            sentiment,
            interest_level,
            has_tested_ifg,
            recommended_action,
            follow_up_timing,
            key_points,
            personalization_hints,
            reasoning,
            analyzed_at,
            conversation_id,
            conversations (
                id,
                linkedin_conversation_id,
                last_message_by,
                last_message_at,
                prospects (
                    id,
                    name,
                    linkedin_url,
                    job_title,
                    company,
                    location,
                    sector
                )
            )
        `)
        .in('recommended_action', ['follow_up', 'close'])
        .neq('recommended_action', 'ignore')
        .gt('lead_score', 0)
        .order('lead_score', { ascending: false });

    if (error) {
        console.error('❌ Error fetching hot leads:', error);
        return { success: false, error };
    }

    // Check for pending follow-up messages
    const { data: pendingMessages } = await supabase
        .from('follow_up_messages')
        .select('conversation_id, generated_message, status')
        .in('status', ['pending', 'approved']);

    const pendingByConv = {};
    (pendingMessages || []).forEach(m => {
        pendingByConv[m.conversation_id] = m;
    });

    // Categorize leads
    const now = new Date();
    const urgent = [];    // Hot leads + they replied / immediate follow-up
    const today = [];     // Warm leads needing follow-up today
    const thisWeek = [];  // Scheduled follow-ups this week

    for (const analysis of analyses) {
        const conv = analysis.conversations;
        if (!conv || !conv.prospects) continue;

        const prospect = conv.prospects;
        const lastMessageDate = new Date(conv.last_message_at);
        const hoursSinceLastMessage = (now - lastMessageDate) / (1000 * 60 * 60);
        const theyRepliedLast = conv.last_message_by === 'them';

        const lead = {
            prospect_id: prospect.id,
            name: prospect.name,
            linkedin_url: prospect.linkedin_url,
            job_title: prospect.job_title,
            company: prospect.company,
            sector: prospect.sector,
            lead_score: analysis.lead_score,
            lead_status: analysis.lead_status,
            sentiment: analysis.sentiment,
            interest_level: analysis.interest_level,
            has_tested_ifg: analysis.has_tested_ifg,
            key_points: analysis.key_points,
            reasoning: analysis.reasoning,
            follow_up_timing: analysis.follow_up_timing,
            last_message_by: conv.last_message_by,
            last_message_at: conv.last_message_at,
            hours_since_last: Math.round(hoursSinceLastMessage),
            has_pending_message: !!pendingByConv[conv.id],
            pending_message: pendingByConv[conv.id]?.generated_message || null,
            conversation_id: conv.id
        };

        // URGENT: They replied and we haven't responded, or hot lead needing immediate action
        if (theyRepliedLast && hoursSinceLastMessage < 48) {
            lead.priority = 'urgent';
            lead.reason = `⚡ ${prospect.name} a répondu il y a ${lead.hours_since_last}h - RÉPONDRE MAINTENANT`;
            urgent.push(lead);
        } else if (analysis.lead_status === 'hot' && analysis.follow_up_timing === 'immediate') {
            lead.priority = 'urgent';
            lead.reason = `🔥 Lead chaud (${analysis.lead_score}/100) - relance immédiate`;
            urgent.push(lead);
        }
        // TODAY: Warm/hot leads with 3-day follow-up timing that's due
        else if (analysis.follow_up_timing === '3_days' && hoursSinceLastMessage >= 48) {
            lead.priority = 'today';
            lead.reason = `📅 Relance prévue aujourd'hui (${lead.hours_since_last}h depuis dernier msg)`;
            today.push(lead);
        } else if (analysis.lead_status === 'hot' && hoursSinceLastMessage >= 24) {
            lead.priority = 'today';
            lead.reason = `🔥 Lead chaud sans réponse depuis ${lead.hours_since_last}h`;
            today.push(lead);
        }
        // THIS WEEK: 1-week follow-ups or warm leads
        else if (analysis.follow_up_timing === '1_week' && hoursSinceLastMessage >= 120) {
            lead.priority = 'this_week';
            lead.reason = `📆 Relance hebdo (${Math.round(hoursSinceLastMessage / 24)}j depuis dernier msg)`;
            thisWeek.push(lead);
        } else if (analysis.lead_status === 'warm' && hoursSinceLastMessage >= 72) {
            lead.priority = 'this_week';
            lead.reason = `🌡️ Lead tiède à relancer (${Math.round(hoursSinceLastMessage / 24)}j)`;
            thisWeek.push(lead);
        }
    }

    // Sort each list by score descending
    urgent.sort((a, b) => b.lead_score - a.lead_score);
    today.sort((a, b) => b.lead_score - a.lead_score);
    thisWeek.sort((a, b) => b.lead_score - a.lead_score);

    return {
        success: true,
        summary: {
            urgent: urgent.length,
            today: today.length,
            this_week: thisWeek.length,
            total: urgent.length + today.length + thisWeek.length
        },
        lists: {
            urgent,
            today,
            this_week: thisWeek
        }
    };
}

module.exports = {
    processConversationsWithAI,
    getDailyFollowUpList,
    approveFollowUpMessage,
    rejectFollowUpMessage,
    getHotLeadsList
};
