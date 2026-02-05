/**
 * Multi-touch outreach sequences for maximum conversion
 * Each sequence adapts based on prospect behavior and profile
 */

const SEQUENCES = {
    // Hot leads - aggressive but smart
    hot_lead: [
        {
            delay_hours: 0,
            type: 'initial',
            goal: 'Get immediate test',
            hooks: [
                'FOMO + social proof',
                'Concrete value (10-15h/week saved)',
                'Zero friction (5 free questions)'
            ]
        },
        {
            delay_hours: 48,
            type: 'follow_up_1',
            goal: 'Address potential objections',
            hooks: [
                'Success story from similar profile',
                'Specific use case for their sector',
                'Limited time offer or exclusivity'
            ]
        },
        {
            delay_hours: 120, // 5 days
            type: 'follow_up_2',
            goal: 'Final push with urgency',
            hooks: [
                'What they\'re missing out on',
                'Competitor advantage',
                'Direct question about their research challenges'
            ]
        }
    ],

    // Warm leads - nurture with value
    warm_lead: [
        {
            delay_hours: 0,
            type: 'initial',
            goal: 'Build interest and trust',
            hooks: [
                'Educational value',
                'Soft social proof',
                'Low-pressure CTA'
            ]
        },
        {
            delay_hours: 72, // 3 days
            type: 'follow_up_1',
            goal: 'Provide concrete value',
            hooks: [
                'Share relevant insight or tip',
                'Case study from their sector',
                'Invite to test specific feature'
            ]
        },
        {
            delay_hours: 168, // 7 days
            type: 'follow_up_2',
            goal: 'Convert to tester',
            hooks: [
                'Time-sensitive opportunity',
                'Personalized demo offer',
                'Success metrics from peers'
            ]
        }
    ],

    // Cold leads - long-term nurture
    cold_lead: [
        {
            delay_hours: 0,
            type: 'initial',
            goal: 'Get on radar',
            hooks: [
                'Pure value (no ask)',
                'Relevant industry insight',
                'Soft introduction'
            ]
        },
        {
            delay_hours: 336, // 14 days
            type: 'follow_up_1',
            goal: 'Build credibility',
            hooks: [
                'Share success story',
                'Industry trend + IFG solution',
                'Very soft CTA'
            ]
        }
    ],

    // Tested but not converted
    tested_not_converted: [
        {
            delay_hours: 24,
            type: 'feedback_request',
            goal: 'Understand objections',
            hooks: [
                'Ask for honest feedback',
                'Address common concerns',
                'Offer personalized onboarding'
            ]
        },
        {
            delay_hours: 120, // 5 days
            type: 'objection_handler',
            goal: 'Overcome specific objections',
            hooks: [
                'New features or improvements',
                'Success story addressing their concern',
                'Limited time offer'
            ]
        }
    ]
};

/**
 * Get optimal timing for next message based on engagement patterns
 */
function getOptimalTiming(conversationHistory, analysis) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const lastMessageDate = new Date(lastMessage.timestamp);
    const hoursSinceLastMessage = (Date.now() - lastMessageDate) / (1000 * 60 * 60);

    // Analyze response patterns
    const responsePattern = analyzeResponsePattern(conversationHistory);

    // Hot lead + fast responder = immediate follow-up
    if (analysis.lead_status === 'hot' && responsePattern.avg_response_hours < 24) {
        return { timing: 'immediate', hours: 0 };
    }

    // Warm lead + medium responder = 2-3 days
    if (analysis.lead_status === 'warm' && responsePattern.avg_response_hours < 72) {
        return { timing: '3_days', hours: 72 };
    }

    // Cold or slow responder = 1 week
    return { timing: '1_week', hours: 168 };
}

/**
 * Analyze prospect's response patterns
 */
function analyzeResponsePattern(messages) {
    const responses = [];
    
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].sender !== messages[i-1].sender) {
            const timeDiff = new Date(messages[i].timestamp) - new Date(messages[i-1].timestamp);
            responses.push(timeDiff / (1000 * 60 * 60)); // hours
        }
    }

    return {
        avg_response_hours: responses.length > 0 
            ? responses.reduce((a, b) => a + b, 0) / responses.length 
            : 72,
        fastest_response: Math.min(...responses, 72),
        response_count: responses.length
    };
}

/**
 * Get next message in sequence
 */
function getNextSequenceMessage(leadStatus, currentStep = 0) {
    const sequence = SEQUENCES[`${leadStatus}_lead`] || SEQUENCES.warm_lead;
    
    if (currentStep >= sequence.length) {
        return null; // Sequence complete
    }

    return sequence[currentStep];
}

/**
 * Calculate message priority score for daily list
 */
function calculateMessagePriority(analysis, profileData, responsePattern) {
    let priority = 0;

    // Lead score weight (40%)
    priority += analysis.lead_score * 0.4;

    // Engagement weight (30%)
    if (responsePattern.avg_response_hours < 24) priority += 30;
    else if (responsePattern.avg_response_hours < 72) priority += 20;
    else priority += 10;

    // Profile quality weight (20%)
    if (profileData.job_title?.toLowerCase().includes('avocat') || 
        profileData.job_title?.toLowerCase().includes('expert')) {
        priority += 20;
    } else if (profileData.job_title?.toLowerCase().includes('directeur')) {
        priority += 15;
    } else {
        priority += 10;
    }

    // Timing weight (10%)
    if (analysis.follow_up_timing === 'immediate') priority += 10;
    else if (analysis.follow_up_timing === '3_days') priority += 7;
    else priority += 5;

    return Math.min(priority, 100);
}

/**
 * Generate A/B test variants for messages
 */
function generateMessageVariants(baseMessage, variantType = 'hook') {
    const variants = {
        original: baseMessage,
        variants: []
    };

    if (variantType === 'hook') {
        // Different opening hooks
        variants.variants.push({
            type: 'social_proof',
            modification: 'Start with social proof'
        });
        variants.variants.push({
            type: 'question',
            modification: 'Start with provocative question'
        });
        variants.variants.push({
            type: 'value',
            modification: 'Start with concrete value proposition'
        });
    } else if (variantType === 'cta') {
        // Different CTAs
        variants.variants.push({
            type: 'direct',
            modification: 'Direct CTA: "Testez maintenant"'
        });
        variants.variants.push({
            type: 'question',
            modification: 'Question CTA: "Curieux de voir ?"'
        });
        variants.variants.push({
            type: 'soft',
            modification: 'Soft CTA: "Disponible pour échanger ?"'
        });
    }

    return variants;
}

module.exports = {
    SEQUENCES,
    getOptimalTiming,
    analyzeResponsePattern,
    getNextSequenceMessage,
    calculateMessagePriority,
    generateMessageVariants
};
