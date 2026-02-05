/**
 * YC-OPTIMIZED Multi-touch outreach sequences for IFG
 * 
 * Based on YC B2B SaaS best practices + Challenger Sale + SPIN Selling:
 * - 17-21 day cadence with 5-8 touchpoints
 * - 2-3 days between messages (sweet spot for engagement)
 * - Tuesday-Thursday optimal (Tue 27% engagement, Wed 33.9% connection)
 * - Best hours: 8h-10h (morning reply peak) and 14h-16h (afternoon open peak)
 * - 80% of deals need 5+ follow-ups, but 44% of reps quit after 1
 * - First message = long + value, follow-ups = ultra short
 * - Each step has a specific psychological goal
 */

const SEQUENCES = {
    // ===== HOT LEADS: They replied / showed interest =====
    // Aggressive 10-day sequence, 5 touches
    hot_lead: [
        {
            step: 1,
            delay_days: 0,
            type: 'initial_value',
            goal: 'Hook + immediate value + zero-friction CTA',
            message_style: 'long',
            psychology: 'CHALLENGER_SALE_REFRAME',
            hooks: [
                'Stat surprenante sur leur secteur',
                'FOMO: "Plusieurs fiscalistes de [secteur] l\'utilisent déjà"',
                'Valeur concrète: 10-15h/semaine gagnées',
                'CTA: 5 questions gratuites = zéro risque'
            ],
            kimi_instruction: 'Message LONG (5-6 lignes). Hook percutant + insight sectoriel + social proof + CTA zéro friction. Assume qu\'ils vont tester.'
        },
        {
            step: 2,
            delay_days: 2,
            type: 'micro_follow_up',
            goal: 'Bump ultra court - rester top of mind',
            message_style: 'ultra_short',
            psychology: 'PATTERN_INTERRUPT',
            hooks: [
                'Question courte et directe',
                '"Maître ?" ou "Avez-vous eu le temps de jeter un œil ?"',
                'Pas de pitch, juste un bump'
            ],
            kimi_instruction: 'Message ULTRA COURT (1 ligne max). Juste un bump amical. Ex: "[Titre] ?" ou "Avez-vous eu 2 min pour tester ?"'
        },
        {
            step: 3,
            delay_days: 5,
            type: 'social_proof',
            goal: 'Success story spécifique à leur profil',
            message_style: 'medium',
            psychology: 'SOCIAL_PROOF_SPECIFIC',
            hooks: [
                'Success story d\'un confrère similaire',
                'Résultat concret (chiffres)',
                'Question SPIN: implication du problème'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Commence par success story d\'un profil similaire avec chiffres concrets. Termine par question SPIN sur l\'impact de la recherche manuelle.'
        },
        {
            step: 4,
            delay_days: 8,
            type: 'loss_aversion',
            goal: 'FOMO + urgence subtile',
            message_style: 'short',
            psychology: 'LOSS_AVERSION',
            hooks: [
                'Ce qu\'ils perdent chaque semaine',
                '"Pendant que vous cherchez, vos confrères..."',
                'Scarcité: places limitées pour leur secteur'
            ],
            kimi_instruction: 'Message COURT (2-3 lignes). Loss aversion: chiffre le coût de ne PAS utiliser IFG. Urgence subtile sans être pushy.'
        },
        {
            step: 5,
            delay_days: 12,
            type: 'breakup',
            goal: 'Dernier message - breakup email technique',
            message_style: 'ultra_short',
            psychology: 'BREAKUP_REVERSE_PSYCHOLOGY',
            hooks: [
                '"Je ne veux pas vous déranger"',
                'Laisse la porte ouverte',
                'Reverse psychology: "Si ce n\'est pas le bon moment..."'
            ],
            kimi_instruction: 'Message ULTRA COURT (2 lignes). Breakup amical: "Je comprends que le timing n\'est pas idéal. L\'offre reste ouverte si vous changez d\'avis." Reverse psychology.'
        }
    ],

    // ===== WARM LEADS: Curious but not committed =====
    // 17-day nurture sequence, 5 touches
    warm_lead: [
        {
            step: 1,
            delay_days: 0,
            type: 'educational_value',
            goal: 'Éduquer + positionner IFG comme évident',
            message_style: 'long',
            psychology: 'CHALLENGER_SALE_TEACH',
            hooks: [
                'Insight sectoriel qu\'ils ne connaissent pas',
                'Problème qu\'ils n\'ont pas identifié',
                'IFG comme solution naturelle (pas pitch)'
            ],
            kimi_instruction: 'Message LONG (5-6 lignes). Commence par un insight/tendance de leur secteur. Montre un problème caché. Positionne IFG comme solution naturelle. CTA soft: "Curieux d\'avoir votre avis".'
        },
        {
            step: 2,
            delay_days: 3,
            type: 'case_study',
            goal: 'Preuve concrète avec cas similaire',
            message_style: 'medium',
            psychology: 'SOCIAL_PROOF_NARRATIVE',
            hooks: [
                'Histoire d\'un utilisateur similaire',
                'Avant/après concret',
                'Question ouverte sur leur situation'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Raconte brièvement comment un profil similaire utilise IFG. Résultat concret. Question: "Vous faites comment actuellement pour [problème] ?"'
        },
        {
            step: 3,
            delay_days: 7,
            type: 'value_add',
            goal: 'Donner avant de demander (réciprocité)',
            message_style: 'medium',
            psychology: 'RECIPROCITY',
            hooks: [
                'Partage un contenu utile (article, jurisprudence)',
                'Montre expertise sans vendre',
                'Soft mention d\'IFG'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Partage une info utile pour leur pratique. Mentionne IFG subtilement comme source. Pas de CTA direct.'
        },
        {
            step: 4,
            delay_days: 12,
            type: 'direct_ask',
            goal: 'CTA direct mais respectueux',
            message_style: 'short',
            psychology: 'ASSUMPTIVE_CLOSE',
            hooks: [
                'Assume qu\'ils vont tester',
                '"Quand est-ce que ça vous arrangerait de tester ?"',
                'Réduis la friction au max'
            ],
            kimi_instruction: 'Message COURT (2-3 lignes). Assumptive close: "Je vous envoie le lien pour vos 5 questions gratuites ?" Pas "si" mais "quand".'
        },
        {
            step: 5,
            delay_days: 17,
            type: 'breakup',
            goal: 'Breakup + porte ouverte',
            message_style: 'ultra_short',
            psychology: 'BREAKUP_REVERSE_PSYCHOLOGY',
            hooks: [
                'Breakup amical',
                'Porte ouverte pour le futur',
                'Pas de pression'
            ],
            kimi_instruction: 'Message ULTRA COURT (1-2 lignes). Breakup: "Je ne veux pas insister. Si le sujet vous intéresse un jour, je suis là." Amical et pro.'
        }
    ],

    // ===== COLD LEADS: No response yet =====
    // 21-day slow nurture, 4 touches
    cold_lead: [
        {
            step: 1,
            delay_days: 0,
            type: 'pure_value',
            goal: 'Se faire remarquer sans vendre',
            message_style: 'medium',
            psychology: 'RECIPROCITY_FIRST',
            hooks: [
                'Observation spécifique sur leur profil/activité',
                'Valeur pure sans demande',
                'Connexion humaine'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Observation personnalisée sur leur profil. Apporte de la valeur (insight, compliment pro). Mentionne IFG en passant. Pas de CTA.'
        },
        {
            step: 2,
            delay_days: 7,
            type: 'gentle_nudge',
            goal: 'Rappel doux avec angle différent',
            message_style: 'short',
            psychology: 'CURIOSITY_GAP',
            hooks: [
                'Angle complètement différent du step 1',
                'Question qui crée la curiosité',
                'Stat surprenante'
            ],
            kimi_instruction: 'Message COURT (2 lignes). Angle différent. Question qui crée la curiosité: "Combien de temps passez-vous par semaine sur la recherche fiscale ?" ou stat surprenante.'
        },
        {
            step: 3,
            delay_days: 14,
            type: 'social_proof_mass',
            goal: 'Montrer que le marché bouge',
            message_style: 'short',
            psychology: 'BANDWAGON_EFFECT',
            hooks: [
                '"Plus de 50 fiscalistes utilisent IFG"',
                'Mouvement du marché',
                'FOMO léger'
            ],
            kimi_instruction: 'Message COURT (2-3 lignes). Social proof massif: "De plus en plus de fiscalistes adoptent ce type d\'outil." FOMO léger. CTA soft.'
        },
        {
            step: 4,
            delay_days: 21,
            type: 'final_breakup',
            goal: 'Dernier essai + breakup',
            message_style: 'ultra_short',
            psychology: 'BREAKUP_REVERSE_PSYCHOLOGY',
            hooks: [
                'Breakup définitif mais amical',
                'Reverse psychology'
            ],
            kimi_instruction: 'Message ULTRA COURT (1 ligne). "Je comprends, pas de souci. L\'offre reste ouverte !" Amical, zéro pression.'
        }
    ],

    // ===== TESTED IFG but not converted =====
    // 10-day conversion sequence, 4 touches
    tested_not_converted: [
        {
            step: 1,
            delay_days: 1,
            type: 'feedback_request',
            goal: 'Comprendre les objections',
            message_style: 'medium',
            psychology: 'CONSULTATIVE_SELL',
            hooks: [
                'Demande de feedback sincère',
                'Montre que tu écoutes',
                'Propose d\'aider sur un cas concret'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Demande feedback sincère sur le test. "Qu\'est-ce qui vous a plu ? Qu\'est-ce qui manque ?" Propose d\'aider sur un cas concret de leur pratique.'
        },
        {
            step: 2,
            delay_days: 5,
            type: 'objection_handler',
            goal: 'Répondre aux objections courantes',
            message_style: 'medium',
            psychology: 'OBJECTION_REFRAME',
            hooks: [
                'Anticipe l\'objection principale',
                'Montre une feature qu\'ils n\'ont pas vue',
                'Success story qui répond à l\'objection'
            ],
            kimi_instruction: 'Message MOYEN (3-4 lignes). Anticipe l\'objection (prix, temps, habitudes). Montre une feature qu\'ils n\'ont peut-être pas testée. Success story.'
        },
        {
            step: 3,
            delay_days: 8,
            type: 'exclusive_offer',
            goal: 'Offre spéciale pour closer',
            message_style: 'short',
            psychology: 'SCARCITY_EXCLUSIVITY',
            hooks: [
                'Offre limitée dans le temps',
                'Accompagnement premium gratuit',
                'Exclusivité early adopter'
            ],
            kimi_instruction: 'Message COURT (2-3 lignes). Offre exclusive: accompagnement personnalisé gratuit pour les premiers utilisateurs. Urgence temporelle.'
        },
        {
            step: 4,
            delay_days: 12,
            type: 'breakup',
            goal: 'Breakup + porte ouverte',
            message_style: 'ultra_short',
            psychology: 'BREAKUP_REVERSE_PSYCHOLOGY',
            hooks: ['Breakup amical', 'Porte ouverte'],
            kimi_instruction: 'Message ULTRA COURT. Breakup amical. "Pas de souci si ce n\'est pas le moment. Je reste dispo."'
        }
    ],

    // ===== THEY REPLIED (any reply) =====
    // Immediate response sequence
    replied: [
        {
            step: 1,
            delay_days: 0,
            type: 'immediate_response',
            goal: 'Répondre dans les 5 min (100x plus de chances)',
            message_style: 'adaptive',
            psychology: 'FIRST_MOVER_ADVANTAGE',
            hooks: [
                'Réponds à leur question/commentaire',
                'Avance la conversation',
                'Propose le test si pas encore fait'
            ],
            kimi_instruction: 'Réponds DIRECTEMENT à ce qu\'ils ont dit. Avance la conversation naturellement. Si intérêt: propose le test. Si objection: reframe. Si question: réponds + ajoute valeur.'
        }
    ]
};

/**
 * Determine where a prospect is in their sequence
 * Returns: { sequence_key, current_step, next_step, is_due_today, days_until_next }
 */
function getSequencePosition(conversation, analysis, messages) {
    const now = Date.now();
    const lastMsg = messages.length ? messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] : null;
    if (!lastMsg) return null;

    const lastMsgDate = new Date(lastMsg.timestamp);
    const daysSinceLastMsg = (now - lastMsgDate.getTime()) / (1000 * 60 * 60 * 24);
    const lastMsgByMe = lastMsg.sender === 'me';
    const lastMsgByThem = !lastMsgByMe;

    // Count how many messages I've sent in a row (= current step in sequence)
    let myConsecutiveMsgs = 0;
    const sorted = [...messages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    for (const m of sorted) {
        if (m.sender === 'me') myConsecutiveMsgs++;
        else break;
    }

    // Determine which sequence to use
    let sequenceKey;
    if (lastMsgByThem) {
        sequenceKey = 'replied'; // They replied! Priority response
    } else if (analysis?.has_tested_ifg && analysis?.lead_status !== 'hot') {
        sequenceKey = 'tested_not_converted';
    } else if (analysis?.lead_status === 'hot') {
        sequenceKey = 'hot_lead';
    } else if (analysis?.lead_status === 'warm') {
        sequenceKey = 'warm_lead';
    } else {
        sequenceKey = 'cold_lead';
    }

    const sequence = SEQUENCES[sequenceKey];
    if (!sequence) return null;

    // Current step = number of my consecutive messages (capped at sequence length)
    const currentStep = Math.min(myConsecutiveMsgs, sequence.length - 1);
    const nextStepIdx = lastMsgByThem ? 0 : currentStep; // If they replied, next is step 0 of replied sequence
    const nextStep = sequence[nextStepIdx];

    if (!nextStep) {
        return { sequenceKey, currentStep, nextStep: null, isDueToday: false, isSequenceComplete: true };
    }

    // Calculate if this message is due today
    const delayDays = nextStep.delay_days;
    const dueDate = new Date(lastMsgDate.getTime() + delayDays * 24 * 60 * 60 * 1000);
    const isDueToday = now >= dueDate.getTime();
    const daysUntilNext = Math.max(0, Math.ceil((dueDate.getTime() - now) / (1000 * 60 * 60 * 24)));

    return {
        sequenceKey,
        currentStep: lastMsgByThem ? 0 : currentStep,
        nextStep,
        nextStepIdx,
        isDueToday,
        isOverdue: daysSinceLastMsg > delayDays + 2, // 2 day grace period
        daysUntilNext,
        daysSinceLastMsg: Math.round(daysSinceLastMsg),
        lastMsgByThem,
        isSequenceComplete: false
    };
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
 * Get optimal timing for next message based on engagement patterns
 */
function getOptimalTiming(conversationHistory, analysis) {
    const pos = getSequencePosition(null, analysis, conversationHistory);
    if (!pos || !pos.nextStep) return { timing: 'none', hours: 0 };
    return { timing: `${pos.nextStep.delay_days}_days`, hours: pos.nextStep.delay_days * 24 };
}

/**
 * Get next message in sequence
 */
function getNextSequenceMessage(leadStatus, currentStep = 0) {
    const sequence = SEQUENCES[`${leadStatus}_lead`] || SEQUENCES.warm_lead;
    if (currentStep >= sequence.length) return null;
    return sequence[currentStep];
}

/**
 * Calculate message priority score for daily "Contacter aujourd'hui" list
 * Higher = contact first
 */
function calculateMessagePriority(analysis, profileData, seqPosition) {
    let priority = 0;

    // They replied = TOP PRIORITY (100x more likely to close if respond in 5 min)
    if (seqPosition?.lastMsgByThem) {
        priority += 50;
    }

    // Lead score weight (25%)
    priority += (analysis?.lead_score || 0) * 0.25;

    // Overdue penalty/bonus (20%)
    if (seqPosition?.isOverdue) priority += 20; // Overdue = urgent
    else if (seqPosition?.isDueToday) priority += 15;

    // Profile quality weight (15%)
    const title = (profileData?.job_title || '').toLowerCase();
    if (title.includes('avocat') || title.includes('counsel') || title.includes('associé')) {
        priority += 15; // Avocats = cible principale
    } else if (title.includes('expert-comptable') || title.includes('expert comptable')) {
        priority += 14;
    } else if (title.includes('directeur fiscal') || title.includes('tax director')) {
        priority += 13;
    } else if (title.includes('juriste') || title.includes('fiscaliste')) {
        priority += 12;
    } else {
        priority += 5;
    }

    // Sequence step bonus (10%) - early steps = more important
    if (seqPosition?.nextStep) {
        const stepBonus = Math.max(0, 10 - (seqPosition.nextStepIdx || 0) * 2);
        priority += stepBonus;
    }

    // Day of week bonus (Tue-Thu optimal)
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek >= 2 && dayOfWeek <= 4) priority += 5; // Tue-Thu

    return Math.min(Math.round(priority), 100);
}

/**
 * Build the "Contacter aujourd'hui" list
 * Called by the 8h and 15h cron jobs
 * Returns prospects sorted by priority with their next sequence step
 */
async function buildContactTodayList(supabase) {
    // Get all active conversations with analysis
    const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
            id, last_message_at, last_message_by, status, engagement_level,
            prospects (id, name, company, job_title, linkedin_url, sector, location),
            messages (content, sender, timestamp),
            ai_analysis (lead_score, lead_status, sentiment, interest_level, has_tested_ifg, 
                         key_points, recommended_action, follow_up_timing, reasoning, personalization_hints)
        `)
        .neq('engagement_level', 'irrelevant')
        .neq('status', 'converted')
        .order('last_message_at', { ascending: false });

    if (error) {
        console.error('❌ Error fetching conversations for today list:', error);
        return { success: false, error };
    }

    const contactToday = [];
    const contactSoon = [];
    const sequenceComplete = [];

    for (const conv of conversations) {
        const analysis = Array.isArray(conv.ai_analysis) ? conv.ai_analysis[0] : conv.ai_analysis;
        const messages = conv.messages || [];
        const prospect = conv.prospects;

        if (!prospect || messages.length === 0) continue;
        if (analysis?.recommended_action === 'ignore') continue;

        const seqPos = getSequencePosition(conv, analysis, messages);
        if (!seqPos) continue;

        // Sequence complete = no more steps
        if (seqPos.isSequenceComplete) {
            sequenceComplete.push({
                conversation_id: conv.id,
                name: prospect.name,
                company: prospect.company,
                job_title: prospect.job_title,
                linkedin_url: prospect.linkedin_url,
                lead_score: analysis?.lead_score || 0,
                lead_status: analysis?.lead_status || 'cold',
                sequence_key: seqPos.sequenceKey,
                reason: 'Séquence terminée'
            });
            continue;
        }

        const priority = calculateMessagePriority(analysis, prospect, seqPos);

        const item = {
            conversation_id: conv.id,
            name: prospect.name,
            company: prospect.company,
            job_title: prospect.job_title,
            linkedin_url: prospect.linkedin_url,
            sector: prospect.sector,
            lead_score: analysis?.lead_score || 0,
            lead_status: analysis?.lead_status || 'cold',
            interest_level: analysis?.interest_level || 'none',
            has_tested_ifg: analysis?.has_tested_ifg || false,
            key_points: analysis?.key_points || [],
            personalization_hints: analysis?.personalization_hints || [],
            // Sequence info
            sequence_key: seqPos.sequenceKey,
            sequence_step: seqPos.nextStepIdx + 1,
            sequence_total: SEQUENCES[seqPos.sequenceKey]?.length || 0,
            sequence_type: seqPos.nextStep.type,
            sequence_goal: seqPos.nextStep.goal,
            sequence_psychology: seqPos.nextStep.psychology,
            message_style: seqPos.nextStep.message_style,
            kimi_instruction: seqPos.nextStep.kimi_instruction,
            // Timing
            days_since_last: seqPos.daysSinceLastMsg,
            days_until_next: seqPos.daysUntilNext,
            is_overdue: seqPos.isOverdue,
            last_message_by: seqPos.lastMsgByThem ? 'them' : 'me',
            // Priority
            priority,
            // Reason
            reason: seqPos.lastMsgByThem 
                ? '⚡ ILS ONT RÉPONDU — Répondre MAINTENANT'
                : seqPos.isOverdue 
                    ? `🔴 En retard de ${seqPos.daysSinceLastMsg - seqPos.nextStep.delay_days}j — ${seqPos.nextStep.goal}`
                    : `📅 Step ${seqPos.nextStepIdx + 1}/${SEQUENCES[seqPos.sequenceKey].length} — ${seqPos.nextStep.goal}`
        };

        if (seqPos.isDueToday || seqPos.lastMsgByThem || seqPos.isOverdue) {
            contactToday.push(item);
        } else if (seqPos.daysUntilNext <= 3) {
            contactSoon.push(item);
        }
    }

    // Sort by priority (highest first)
    contactToday.sort((a, b) => b.priority - a.priority);
    contactSoon.sort((a, b) => b.priority - a.priority);

    return {
        success: true,
        generated_at: new Date().toISOString(),
        summary: {
            contact_today: contactToday.length,
            contact_soon: contactSoon.length,
            sequence_complete: sequenceComplete.length,
            total_active: conversations.length
        },
        lists: {
            contact_today: contactToday,
            contact_soon: contactSoon,
            sequence_complete: sequenceComplete
        }
    };
}

module.exports = {
    SEQUENCES,
    getSequencePosition,
    getOptimalTiming,
    analyzeResponsePattern,
    getNextSequenceMessage,
    calculateMessagePriority,
    buildContactTodayList
};
