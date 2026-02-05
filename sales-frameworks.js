/**
 * Advanced Sales Frameworks & Methodologies
 * Based on YC, Challenger Sale, SPIN, MEDDIC, and top B2B SaaS playbooks
 */

const SALES_FRAMEWORKS = {
    
    // CHALLENGER SALE - Commercial Teaching
    challenger: {
        name: 'Challenger Sale',
        phases: [
            {
                phase: 'warmer',
                goal: 'Get prospect nodding in agreement',
                technique: 'Describe their problem in a way they recognize immediately'
            },
            {
                phase: 'reframe',
                goal: 'Deliver new insight they hadn\'t considered',
                technique: 'Change how they think about the problem'
            },
            {
                phase: 'rational_drowning',
                goal: 'Quantify the cost of inaction',
                technique: 'Use concrete numbers: hours lost, money wasted, opportunities missed'
            },
            {
                phase: 'emotional_impact',
                goal: 'Make it personal and painful',
                technique: 'Tell story about similar company/person who suffered from this'
            },
            {
                phase: 'new_way',
                goal: 'Introduce behavioral change needed',
                technique: 'Show the path forward (not product yet)'
            },
            {
                phase: 'solution',
                goal: 'Position your product as enabler',
                technique: 'IFG helps them adopt the new way better than anything else'
            }
        ],
        best_for: 'New product categories, competitive markets, differentiators buyers undervalue'
    },

    // SPIN SELLING - Strategic Questions
    spin: {
        name: 'SPIN Selling',
        question_types: [
            {
                type: 'situation',
                goal: 'Understand context',
                examples: [
                    'Combien de temps passez-vous sur la recherche fiscale par semaine ?',
                    'Quels outils utilisez-vous actuellement pour vos recherches ?',
                    'Combien de dossiers fiscaux complexes traitez-vous par mois ?'
                ]
            },
            {
                type: 'problem',
                goal: 'Uncover pain points',
                examples: [
                    'Quelles sont vos plus grandes frustrations avec la recherche fiscale actuelle ?',
                    'Combien de temps perdez-vous à chercher dans plusieurs sources ?',
                    'À quelle fréquence manquez-vous des jurisprudences pertinentes ?'
                ]
            },
            {
                type: 'implication',
                goal: 'Build urgency by exploring consequences',
                examples: [
                    'Quel impact cela a-t-il sur votre rentabilité ?',
                    'Comment cela affecte-t-il la qualité de vos conseils clients ?',
                    'Que se passe-t-il si vous ratez une jurisprudence clé ?'
                ]
            },
            {
                type: 'need_payoff',
                goal: 'Get buyer to sell themselves',
                examples: [
                    'Que changerait pour vous un gain de 10-15h/semaine ?',
                    'Quelle valeur aurait une recherche 3x plus rapide et précise ?',
                    'Comment cela transformerait-il votre pratique ?'
                ]
            }
        ],
        best_for: 'Complex sales, consultative approach, building deep understanding'
    },

    // B2B SaaS COLD OUTREACH - YC Playbook
    cold_outreach_secrets: [
        {
            secret: 'Ask simple questions to spark conversations',
            why: 'Demos get booked in conversations, not pitches',
            how: 'Make it easy to respond. Get insights, referrals, demos.'
        },
        {
            secret: 'Humanize and make it personal',
            why: 'Feel like a real person, not a bot',
            how: 'Use natural language, small imperfections, "sent from iPhone"'
        },
        {
            secret: 'Use social proof strategically',
            why: 'Reduces risk, builds credibility',
            how: 'Mention similar happy customers in their sector'
        },
        {
            secret: 'Longer initial, shorter follow-ups',
            why: 'Most meetings booked at email #2',
            how: 'First email: value. Follow-up: just "Maître ?" or prospect name'
        },
        {
            secret: 'A/B test everything',
            why: 'Data-driven optimization',
            how: 'Test headlines, body, CTAs. Track open, click, reply, demo rates'
        },
        {
            secret: 'Offer free value upfront',
            why: 'Reciprocity principle',
            how: 'Free resource, industry insight, 5 free questions'
        },
        {
            secret: 'Make CTA frictionless',
            why: 'Remove all barriers to action',
            how: 'Calendar link, one-click test, zero commitment'
        },
        {
            secret: 'Use specific, not generic personalization',
            why: 'Stand out from spam',
            how: 'Reference specific work, company news, industry challenges'
        },
        {
            secret: 'Create FOMO without being pushy',
            why: 'Urgency drives action',
            how: '"Plusieurs fiscalistes de [secteur] utilisent déjà IFG..."'
        },
        {
            secret: 'End with thought-provoking question',
            why: 'Forces reflection and response',
            how: 'Question about their specific challenge or use case'
        }
    ],

    // CONVERSION PSYCHOLOGY
    psychology_triggers: [
        {
            trigger: 'Scarcity',
            application: 'Limited beta access, exclusive early adopter program',
            example: 'Places limitées pour les fiscalistes de votre secteur'
        },
        {
            trigger: 'Social Proof',
            application: 'Other experts already using it',
            example: 'Plus de 50 fiscalistes utilisent déjà IFG quotidiennement'
        },
        {
            trigger: 'Authority',
            application: 'Expertise and credibility',
            example: 'Développé avec des fiscalistes pour des fiscalistes'
        },
        {
            trigger: 'Reciprocity',
            application: 'Give value first',
            example: '5 questions gratuites pour tester sans engagement'
        },
        {
            trigger: 'Consistency',
            application: 'Small yes leads to big yes',
            example: 'Juste une question rapide... puis test... puis abonnement'
        },
        {
            trigger: 'Liking',
            application: 'Build rapport and similarity',
            example: 'Je comprends votre défi avec [specific problem]'
        },
        {
            trigger: 'Loss Aversion',
            application: 'Fear of missing out',
            example: 'Pendant que vous cherchez manuellement, vos confrères gagnent 15h/semaine'
        }
    ],

    // MESSAGE STRUCTURE - Proven Formula
    message_structure: {
        hook: {
            goal: 'Grab attention in 3 seconds',
            techniques: [
                'Provocative question',
                'Surprising statistic',
                'Specific observation about their work',
                'Social proof from their sector'
            ],
            examples: [
                'Maître, 15h/semaine de recherche fiscale en moins, ça changerait quoi pour vous ?',
                'J\'ai remarqué votre expertise en fiscalité internationale chez [company]...',
                'Plusieurs fiscalistes de [sector] m\'ont dit la même chose que vous...'
            ]
        },
        value_prop: {
            goal: 'Show concrete benefit',
            formula: 'IFG = copilote qui [specific benefit] en [time saved]',
            examples: [
                'IFG trouve les jurisprudences pertinentes en 30 secondes vs 2h',
                'Recherche fiscale 3x plus rapide avec sources vérifiées',
                'Votre expertise + IFG = combinaison redoutable'
            ]
        },
        social_proof: {
            goal: 'Reduce risk, build credibility',
            techniques: [
                'Mention similar users',
                'Specific results/metrics',
                'Industry recognition'
            ],
            examples: [
                'Déjà utilisé par des fiscalistes chez [similar companies]',
                'Nos utilisateurs gagnent en moyenne 10-15h/semaine',
                'Spécialement conçu pour la fiscalité française et internationale'
            ]
        },
        cta: {
            goal: 'Frictionless next step',
            techniques: [
                'Zero commitment',
                'Specific and easy',
                'Question-based',
                'Assume the close'
            ],
            examples: [
                '5 questions gratuites pour tester ?',
                'Curieux de voir comment ça marche sur un de vos cas ?',
                'Disponible 5 min cette semaine pour un test rapide ?',
                'Quand seriez-vous dispo pour tester sur un cas réel ?'
            ]
        }
    }
};

/**
 * Generate message using proven frameworks
 */
function applyFramework(framework, prospectData, conversationContext) {
    const templates = {
        challenger: generateChallengerMessage,
        spin: generateSPINMessage,
        cold_outreach: generateColdOutreachMessage
    };

    return templates[framework](prospectData, conversationContext);
}

/**
 * Challenger Sale message template
 */
function generateChallengerMessage(prospect, context) {
    return {
        framework: 'challenger',
        prompt_additions: `
FRAMEWORK: CHALLENGER SALE
1. WARMER: "${prospect.name}, comme beaucoup de fiscalistes, vous passez probablement des heures sur la recherche..."
2. REFRAME: "Ce que peu réalisent : 70% du temps de recherche est perdu à naviguer entre sources"
3. RATIONAL DROWNING: "15h/semaine × 52 semaines = 780h/an de recherche pure"
4. EMOTIONAL IMPACT: "Un confrère m'a dit avoir raté une jurisprudence clé qui a coûté cher à son client..."
5. NEW WAY: "Les meilleurs fiscalistes utilisent maintenant un copilote IA pour la recherche"
6. SOLUTION: "IFG centralise tout : doctrine, jurisprudence, BOFiP en une seule recherche intelligente"
        `
    };
}

/**
 * SPIN Selling message template
 */
function generateSPINMessage(prospect, context) {
    return {
        framework: 'spin',
        prompt_additions: `
FRAMEWORK: SPIN SELLING
SITUATION: Comprendre leur contexte actuel
PROBLEM: "Quelle est votre plus grande frustration avec la recherche fiscale ?"
IMPLICATION: "Combien de temps cela vous fait-il perdre par semaine ?"
NEED-PAYOFF: "Que changerait un gain de 10-15h/semaine pour votre pratique ?"
        `
    };
}

module.exports = {
    SALES_FRAMEWORKS,
    applyFramework
};
