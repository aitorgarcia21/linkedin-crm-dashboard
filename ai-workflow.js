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
    
    console.log('🤖 Starting AI analysis workflow...');
    
    // Get conversations that need analysis (no existing analysis or old analysis)
    const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
            id,
            linkedin_conversation_id,
            prospect_id,
            last_message_at,
            prospects (
                id,
                name,
                linkedin_url,
                job_title,
                company,
                location,
                sector
            ),
            messages (
                sender,
                content,
                timestamp
            )
        `)
        .order('last_message_at', { ascending: false })
        .limit(50);

    if (convError) {
        console.error('❌ Error fetching conversations:', convError);
        return { success: false, error: convError };
    }

    console.log(`📊 Found ${conversations.length} conversations to analyze`);

    const results = {
        analyzed: 0,
        hot_leads: 0,
        warm_leads: 0,
        cold_leads: 0,
        messages_generated: 0,
        errors: 0
    };

    for (const conv of conversations) {
        try {
            const prospect = conv.prospects;
            const messages = conv.messages || [];

            if (messages.length === 0) {
                console.log(`⏭️  Skipping ${prospect.name} (no messages)`);
                continue;
            }

            // Check if already analyzed recently (within 24h)
            const { data: existingAnalysis } = await supabase
                .from('ai_analysis')
                .select('analyzed_at')
                .eq('conversation_id', conv.id)
                .single();

            if (existingAnalysis) {
                const hoursSinceAnalysis = (Date.now() - new Date(existingAnalysis.analyzed_at)) / (1000 * 60 * 60);
                if (hoursSinceAnalysis < 24) {
                    console.log(`⏭️  Skipping ${prospect.name} (analyzed ${Math.round(hoursSinceAnalysis)}h ago)`);
                    continue;
                }
            }

            console.log(`\n🔍 Analyzing: ${prospect.name}...`);

            // Analyze conversation with AI
            const { success, analysis } = await analyzeConversation(prospect.name, messages);

            if (!success) {
                console.log(`⚠️  Analysis failed for ${prospect.name}`);
                results.errors++;
                continue;
            }

            console.log(`   📊 Score: ${analysis.lead_score}/100 (${analysis.lead_status})`);
            console.log(`   💡 Action: ${analysis.recommended_action} (${analysis.follow_up_timing})`);

            // Save analysis to database
            const { data: savedAnalysis, error: analysisError } = await supabase
                .from('ai_analysis')
                .upsert({
                    conversation_id: conv.id,
                    lead_score: analysis.lead_score,
                    lead_status: analysis.lead_status,
                    sentiment: analysis.sentiment,
                    interest_level: analysis.interest_level,
                    has_tested_ifg: analysis.has_tested_ifg,
                    key_points: analysis.key_points,
                    recommended_action: analysis.recommended_action,
                    follow_up_timing: analysis.follow_up_timing,
                    personalization_hints: analysis.personalization_hints,
                    reasoning: analysis.reasoning,
                    analyzed_at: new Date().toISOString()
                }, { onConflict: 'conversation_id' })
                .select()
                .single();

            if (analysisError) {
                console.log(`⚠️  Error saving analysis: ${analysisError.message}`);
                results.errors++;
                continue;
            }

            results.analyzed++;
            if (analysis.lead_status === 'hot') results.hot_leads++;
            else if (analysis.lead_status === 'warm') results.warm_leads++;
            else results.cold_leads++;

            // Generate follow-up message if recommended
            if (analysis.recommended_action === 'follow_up') {
                console.log(`   ✍️  Generating follow-up message...`);

                // Check IFG status (mock for now - will connect to IFG Supabase)
                const ifgStatus = {
                    has_tested: analysis.has_tested_ifg,
                    is_subscriber: false
                };

                const profileData = {
                    job_title: prospect.job_title,
                    company: prospect.company,
                    location: prospect.location,
                    sector: prospect.sector
                };

                const { success: msgSuccess, message } = await generateFollowUpMessage(
                    prospect.name,
                    profileData,
                    messages,
                    analysis,
                    ifgStatus
                );

                if (msgSuccess) {
                    // Save generated message for approval
                    const { error: msgError } = await supabase
                        .from('follow_up_messages')
                        .insert({
                            conversation_id: conv.id,
                            ai_analysis_id: savedAnalysis.id,
                            generated_message: message,
                            status: 'pending'
                        });

                    if (!msgError) {
                        console.log(`   ✅ Message generated and saved for approval`);
                        results.messages_generated++;
                    } else {
                        console.log(`   ⚠️  Error saving message: ${msgError.message}`);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ Error processing ${conv.prospects?.name}:`, error.message);
            results.errors++;
        }
    }

    console.log('\n📈 AI Analysis Summary:');
    console.log(`   Analyzed: ${results.analyzed}`);
    console.log(`   🔥 Hot leads: ${results.hot_leads}`);
    console.log(`   🌡️  Warm leads: ${results.warm_leads}`);
    console.log(`   ❄️  Cold leads: ${results.cold_leads}`);
    console.log(`   ✉️  Messages generated: ${results.messages_generated}`);
    console.log(`   ⚠️  Errors: ${results.errors}`);

    return {
        success: true,
        results
    };
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

module.exports = {
    processConversationsWithAI,
    getDailyFollowUpList,
    approveFollowUpMessage,
    rejectFollowUpMessage
};
