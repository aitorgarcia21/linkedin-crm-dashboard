const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

/**
 * Analytics Engine - Track, analyze, and optimize outreach performance
 */

/**
 * Track message performance metrics
 */
async function trackMessagePerformance(messageId, event, metadata = {}) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { error } = await supabase
        .from('message_events')
        .insert({
            message_id: messageId,
            event_type: event, // sent, opened, clicked, replied, converted
            metadata,
            timestamp: new Date().toISOString()
        });

    if (error) {
        console.error('Error tracking event:', error);
        return { success: false, error };
    }

    return { success: true };
}

/**
 * Get comprehensive analytics for all sequences
 */
async function getSequenceAnalytics(timeframe = '30_days') {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Calculate date range
    const daysMap = { '7_days': 7, '30_days': 30, '90_days': 90, 'all_time': 36500 };
    const days = daysMap[timeframe] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all messages with their events
    const { data: messages, error } = await supabase
        .from('follow_up_messages')
        .select(`
            id,
            generated_message,
            status,
            created_at,
            sent_at,
            conversation_id,
            ai_analysis (
                lead_score,
                lead_status,
                sentiment
            ),
            message_events (
                event_type,
                timestamp,
                metadata
            ),
            conversations (
                prospects (
                    job_title,
                    company,
                    sector
                )
            )
        `)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching analytics:', error);
        return { success: false, error };
    }

    // Calculate metrics
    const analytics = calculateMetrics(messages);

    return {
        success: true,
        analytics,
        timeframe,
        total_messages: messages.length
    };
}

/**
 * Calculate performance metrics from messages
 */
function calculateMetrics(messages) {
    const metrics = {
        overall: {
            total_sent: 0,
            total_opened: 0,
            total_replied: 0,
            total_converted: 0,
            open_rate: 0,
            reply_rate: 0,
            conversion_rate: 0
        },
        by_lead_status: {
            hot: { sent: 0, replied: 0, converted: 0 },
            warm: { sent: 0, replied: 0, converted: 0 },
            cold: { sent: 0, replied: 0, converted: 0 }
        },
        by_job_title: {},
        by_sector: {},
        best_performing_messages: [],
        worst_performing_messages: [],
        optimal_send_times: {},
        message_length_analysis: {
            short: { count: 0, reply_rate: 0 },
            medium: { count: 0, reply_rate: 0 },
            long: { count: 0, reply_rate: 0 }
        }
    };

    messages.forEach(msg => {
        if (msg.status !== 'sent') return;

        metrics.overall.total_sent++;

        const events = msg.message_events || [];
        const hasOpened = events.some(e => e.event_type === 'opened');
        const hasReplied = events.some(e => e.event_type === 'replied');
        const hasConverted = events.some(e => e.event_type === 'converted');

        if (hasOpened) metrics.overall.total_opened++;
        if (hasReplied) metrics.overall.total_replied++;
        if (hasConverted) metrics.overall.total_converted++;

        // By lead status
        const leadStatus = msg.ai_analysis?.lead_status || 'warm';
        if (metrics.by_lead_status[leadStatus]) {
            metrics.by_lead_status[leadStatus].sent++;
            if (hasReplied) metrics.by_lead_status[leadStatus].replied++;
            if (hasConverted) metrics.by_lead_status[leadStatus].converted++;
        }

        // By job title
        const jobTitle = msg.conversations?.prospects?.job_title || 'Unknown';
        if (!metrics.by_job_title[jobTitle]) {
            metrics.by_job_title[jobTitle] = { sent: 0, replied: 0, converted: 0 };
        }
        metrics.by_job_title[jobTitle].sent++;
        if (hasReplied) metrics.by_job_title[jobTitle].replied++;
        if (hasConverted) metrics.by_job_title[jobTitle].converted++;

        // By sector
        const sector = msg.conversations?.prospects?.sector || 'Unknown';
        if (!metrics.by_sector[sector]) {
            metrics.by_sector[sector] = { sent: 0, replied: 0, converted: 0 };
        }
        metrics.by_sector[sector].sent++;
        if (hasReplied) metrics.by_sector[sector].replied++;
        if (hasConverted) metrics.by_sector[sector].converted++;

        // Message length analysis
        const msgLength = msg.generated_message?.length || 0;
        let lengthCategory = 'medium';
        if (msgLength < 200) lengthCategory = 'short';
        else if (msgLength > 400) lengthCategory = 'long';

        metrics.message_length_analysis[lengthCategory].count++;
        if (hasReplied) {
            metrics.message_length_analysis[lengthCategory].reply_rate++;
        }

        // Optimal send times
        if (msg.sent_at) {
            const hour = new Date(msg.sent_at).getHours();
            if (!metrics.optimal_send_times[hour]) {
                metrics.optimal_send_times[hour] = { sent: 0, replied: 0 };
            }
            metrics.optimal_send_times[hour].sent++;
            if (hasReplied) metrics.optimal_send_times[hour].replied++;
        }

        // Track best/worst performers
        const performance = {
            message_id: msg.id,
            message: msg.generated_message,
            replied: hasReplied,
            converted: hasConverted,
            lead_status: leadStatus
        };

        if (hasConverted) {
            metrics.best_performing_messages.push(performance);
        } else if (!hasReplied && metrics.overall.total_sent > 10) {
            metrics.worst_performing_messages.push(performance);
        }
    });

    // Calculate rates
    if (metrics.overall.total_sent > 0) {
        metrics.overall.open_rate = (metrics.overall.total_opened / metrics.overall.total_sent * 100).toFixed(2);
        metrics.overall.reply_rate = (metrics.overall.total_replied / metrics.overall.total_sent * 100).toFixed(2);
        metrics.overall.conversion_rate = (metrics.overall.total_converted / metrics.overall.total_sent * 100).toFixed(2);
    }

    // Calculate reply rates for message lengths
    Object.keys(metrics.message_length_analysis).forEach(length => {
        const data = metrics.message_length_analysis[length];
        if (data.count > 0) {
            data.reply_rate = (data.reply_rate / data.count * 100).toFixed(2);
        }
    });

    return metrics;
}

/**
 * AI-powered sequence optimizer
 * Analyzes performance and recommends next best sequence
 */
async function getSequenceRecommendations(prospectId) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Get prospect's conversation history and message performance
    const { data: conversation } = await supabase
        .from('conversations')
        .select(`
            id,
            prospects (
                id,
                name,
                job_title,
                company,
                sector
            ),
            ai_analysis (
                lead_score,
                lead_status,
                sentiment,
                follow_up_timing
            ),
            follow_up_messages (
                id,
                generated_message,
                status,
                sent_at,
                message_events (
                    event_type,
                    timestamp
                )
            ),
            messages (
                sender,
                content,
                timestamp
            )
        `)
        .eq('prospect_id', prospectId)
        .single();

    if (!conversation) {
        return { success: false, error: 'Conversation not found' };
    }

    // Get global performance data
    const { analytics } = await getSequenceAnalytics('30_days');

    // Analyze what works best for similar profiles
    const similarProfilePerformance = analyzeSimilarProfiles(
        conversation.prospects,
        analytics
    );

    // Determine next best sequence
    const recommendation = determineNextSequence(
        conversation,
        similarProfilePerformance,
        analytics
    );

    return {
        success: true,
        recommendation
    };
}

/**
 * Analyze performance for similar prospect profiles
 */
function analyzeSimilarProfiles(prospect, analytics) {
    const jobTitle = prospect.job_title || 'Unknown';
    const sector = prospect.sector || 'Unknown';

    const jobPerformance = analytics.by_job_title[jobTitle] || { sent: 0, replied: 0 };
    const sectorPerformance = analytics.by_sector[sector] || { sent: 0, replied: 0 };

    return {
        job_title_reply_rate: jobPerformance.sent > 0 
            ? (jobPerformance.replied / jobPerformance.sent * 100).toFixed(2)
            : 0,
        sector_reply_rate: sectorPerformance.sent > 0
            ? (sectorPerformance.replied / sectorPerformance.sent * 100).toFixed(2)
            : 0,
        best_performing_length: getBestPerformingLength(analytics.message_length_analysis),
        optimal_send_hour: getOptimalSendTime(analytics.optimal_send_times)
    };
}

/**
 * Get best performing message length
 */
function getBestPerformingLength(lengthAnalysis) {
    let best = { length: 'medium', rate: 0 };

    Object.entries(lengthAnalysis).forEach(([length, data]) => {
        const rate = parseFloat(data.reply_rate) || 0;
        if (rate > best.rate) {
            best = { length, rate };
        }
    });

    return best;
}

/**
 * Get optimal send time based on reply rates
 */
function getOptimalSendTime(sendTimes) {
    let best = { hour: 10, rate: 0 }; // Default 10am

    Object.entries(sendTimes).forEach(([hour, data]) => {
        const rate = data.sent > 0 ? (data.replied / data.sent) : 0;
        if (rate > best.rate) {
            best = { hour: parseInt(hour), rate };
        }
    });

    return best;
}

/**
 * Determine next best sequence based on data
 */
function determineNextSequence(conversation, similarPerformance, globalAnalytics) {
    const analysis = conversation.ai_analysis;
    const messages = conversation.follow_up_messages || [];
    const lastMessage = messages[messages.length - 1];

    const recommendation = {
        sequence_type: 'warm_lead', // hot_lead, warm_lead, cold_lead
        approach: 'challenger', // challenger, spin, value_first
        message_length: similarPerformance.best_performing_length.length,
        send_timing: {
            delay_hours: 72,
            optimal_hour: similarPerformance.optimal_send_hour.hour
        },
        personalization_level: 'high',
        include_social_proof: true,
        cta_type: 'question', // direct, question, soft
        reasoning: []
    };

    // Determine sequence type based on lead status
    if (analysis?.lead_status === 'hot') {
        recommendation.sequence_type = 'hot_lead';
        recommendation.send_timing.delay_hours = 24;
        recommendation.approach = 'direct_value';
        recommendation.reasoning.push('Hot lead - aggressive follow-up with direct value proposition');
    } else if (analysis?.lead_status === 'cold') {
        recommendation.sequence_type = 'cold_lead';
        recommendation.send_timing.delay_hours = 168; // 7 days
        recommendation.approach = 'value_first';
        recommendation.reasoning.push('Cold lead - long nurture with pure value, no ask');
    }

    // Adjust based on previous message performance
    if (lastMessage) {
        const events = lastMessage.message_events || [];
        const hasReplied = events.some(e => e.event_type === 'replied');
        
        if (!hasReplied && messages.length >= 2) {
            recommendation.approach = 'challenger';
            recommendation.reasoning.push('No reply after 2 messages - switch to Challenger Sale to reframe problem');
        }
    }

    // Use best performing approach for similar profiles
    if (similarPerformance.job_title_reply_rate > 30) {
        recommendation.personalization_level = 'extreme';
        recommendation.reasoning.push(`High reply rate (${similarPerformance.job_title_reply_rate}%) for this job title - use extreme personalization`);
    }

    // Optimal message length
    recommendation.reasoning.push(`${recommendation.message_length} messages perform best (${similarPerformance.best_performing_length.rate}% reply rate)`);

    // Optimal timing
    recommendation.reasoning.push(`Send at ${recommendation.send_timing.optimal_hour}h for best results`);

    return recommendation;
}

/**
 * A/B test message variants
 */
async function createABTest(baseMessageId, variants) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase
        .from('ab_tests')
        .insert({
            base_message_id: baseMessageId,
            variants,
            status: 'active',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        return { success: false, error };
    }

    return { success: true, test: data };
}

/**
 * Get A/B test results and determine winner
 */
async function getABTestResults(testId) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: test, error } = await supabase
        .from('ab_tests')
        .select(`
            *,
            follow_up_messages (
                id,
                generated_message,
                status,
                message_events (
                    event_type
                )
            )
        `)
        .eq('id', testId)
        .single();

    if (error) {
        return { success: false, error };
    }

    // Calculate performance for each variant
    const results = test.variants.map((variant, index) => {
        const messages = test.follow_up_messages.filter(m => 
            m.generated_message.includes(variant.key_phrase)
        );

        const sent = messages.length;
        const replied = messages.filter(m => 
            m.message_events.some(e => e.event_type === 'replied')
        ).length;

        return {
            variant: variant.name,
            sent,
            replied,
            reply_rate: sent > 0 ? (replied / sent * 100).toFixed(2) : 0
        };
    });

    // Determine winner
    const winner = results.reduce((best, current) => 
        parseFloat(current.reply_rate) > parseFloat(best.reply_rate) ? current : best
    );

    return {
        success: true,
        results,
        winner,
        recommendation: `Use "${winner.variant}" approach - ${winner.reply_rate}% reply rate`
    };
}

module.exports = {
    trackMessagePerformance,
    getSequenceAnalytics,
    getSequenceRecommendations,
    createABTest,
    getABTestResults
};
