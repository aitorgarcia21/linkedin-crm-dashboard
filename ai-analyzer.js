const fetch = require('node-fetch');

const KIMI_API_KEY = process.env.KIMI_API_KEY || 'sk-c7WDIB5Ryc59fJdmNN7kjcdiPljD0gzYvOlPRRLCwRkbp1mb';
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.5';

/**
 * Analyze a conversation with Kimi K2.5 AI
 * Returns lead score, sentiment, and recommended action
 */
async function analyzeConversation(prospectName, messages) {
    try {
        // Format conversation for AI
        const conversationText = messages.map(msg => 
            `${msg.sender === 'me' ? 'Moi (Aitor)' : prospectName}: ${msg.content}`
        ).join('\n\n');

        // Calculate timing context from messages
        const sorted = [...messages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const lastMsg = sorted[0];
        const lastMsgDate = lastMsg ? new Date(lastMsg.timestamp) : null;
        const daysSinceLastMsg = lastMsgDate ? Math.round((Date.now() - lastMsgDate.getTime()) / 86400000) : 999;
        const lastMsgBy = lastMsg?.sender === 'me' ? 'Moi (Aitor)' : prospectName;
        const myMsgCount = messages.filter(m => m.sender === 'me').length;
        const theirMsgCount = messages.filter(m => m.sender !== 'me').length;
        const unansweredFollowUps = (() => {
            let count = 0;
            for (const m of sorted) {
                if (m.sender === 'me') count++;
                else break;
            }
            return count;
        })();

        const prompt = `Tu es un assistant commercial expert pour IFG, un système de recherche adapté pour la fiscalité.

Analyse cette conversation LinkedIn et fournis une évaluation structurée :

CONVERSATION:
${conversationText}

CONTEXTE TEMPOREL (CRUCIAL pour le timing):
- Date d'aujourd'hui: ${new Date().toLocaleDateString('fr-FR')}
- Dernier message: il y a ${daysSinceLastMsg} jour(s) (${lastMsgDate ? lastMsgDate.toLocaleDateString('fr-FR') : 'jamais'})
- Dernier message envoyé par: ${lastMsgBy}
- Mes messages envoyés: ${myMsgCount} | Leurs réponses: ${theirMsgCount}
- Messages consécutifs sans réponse de leur part: ${unansweredFollowUps}

CONTEXTE IFG:
- IFG est un copilote IA pour la recherche fiscale (ne remplace PAS l'expert, l'assiste)
- Système de recherche spécialisé en fiscalité française et internationale
- Cible: avocats fiscalistes, experts-comptables, directeurs fiscaux
- Offre: 5 questions gratuites pour tester
- Produit incroyable qui change la façon de faire de la recherche fiscale

ÉTAPE 1 - FILTRAGE (CRUCIAL):
D'abord, détermine si cette conversation est PERTINENTE pour IFG.
Une conversation est pertinente si:
- On parle de fiscalité, droit fiscal, recherche juridique, IFG, ou du produit
- C'est un prospect potentiel (avocat, fiscaliste, expert-comptable, directeur fiscal, juriste)
- On a démarché cette personne pour IFG
- La personne a montré un intérêt pour un outil de recherche fiscale

Une conversation est NON PERTINENTE si:
- C'est du spam, de la pub, du recrutement
- C'est une conversation personnelle sans rapport avec IFG
- C'est un vendeur qui nous démarche
- C'est une simple connexion LinkedIn sans échange pertinent
- Le sujet n'a rien à voir avec la fiscalité ou IFG

ANALYSE DEMANDÉE (réponds en JSON strict):
{
  "is_relevant": <true|false, est-ce une conversation pertinente pour IFG ?>,
  "irrelevant_reason": "<raison si non pertinent, sinon null>",
  "lead_score": <0-100, score de chaleur du lead (0 si non pertinent)>,
  "lead_status": "<hot|warm|cold>",
  "sentiment": "<positive|neutral|negative>",
  "interest_level": "<high|medium|low|none>",
  "has_tested_ifg": <true|false, si le prospect a mentionné avoir testé IFG>,
  "key_points": ["point1", "point2"],
  "recommended_action": "<follow_up|wait|close|ignore>",
  "follow_up_timing": "<immediate|2_days|3_days|5_days|7_days|10_days|14_days|none>",
  "personalization_hints": ["élément1 à personnaliser", "élément2"],
  "reasoning": "Explication courte de ton analyse"
}

CRITÈRES DE SCORING (seulement si pertinent):
- Hot (80-100): Intérêt explicite, questions précises, demande de test/démo
- Warm (50-79): Réponse positive, curiosité, mais pas d'engagement immédiat
- Cold (0-49): Pas de réponse, réponse négative, ou pas d'intérêt
- Si NON PERTINENT: lead_score = 0, lead_status = "cold", recommended_action = "ignore"

CADENCE DE RELANCE (follow_up_timing) — BASÉE SUR LE CONTEXTE TEMPOREL CI-DESSUS:
Le timing dépend de: qui a envoyé le dernier message, il y a combien de jours, et combien de relances sans réponse.

SI LE PROSPECT A RÉPONDU EN DERNIER (c'est à nous de répondre):
- → immediate (répondre vite, ne pas laisser refroidir)

SI C'EST MOI QUI AI ENVOYÉ LE DERNIER MESSAGE (j'attends leur réponse):
- 0 relance sans réponse + dernier msg < 3j → wait (patience, trop tôt)
- 0 relance sans réponse + dernier msg 3-5j → 2_days (relancer doucement)
- 1 relance sans réponse + dernier msg < 5j → wait (laisser respirer)
- 1 relance sans réponse + dernier msg 5-7j → 3_days
- 2 relances sans réponse → 5_days (espacer)
- 3+ relances sans réponse → 10_days ou 14_days (dernier essai)
- 4+ relances sans réponse → none (arrêter, ne pas harceler)

AJUSTEMENT PAR TEMPÉRATURE:
- Hot lead: diviser le timing par 2 (plus urgent)
- Cold lead: multiplier par 1.5 (plus patient)

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

        // Retry up to 2 times on empty/invalid responses
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) {
                    // Wait before retry (1s, then 2s)
                    await new Promise(r => setTimeout(r, attempt * 1000));
                }

                const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${KIMI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: KIMI_MODEL,
                        messages: [
                            { role: 'user', content: prompt }
                        ],
                        temperature: 1,
                        max_tokens: 4096
                    })
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    if (response.status === 429) {
                        // Rate limited — wait longer and retry
                        await new Promise(r => setTimeout(r, 3000));
                        lastError = new Error(`Rate limited (429)`);
                        continue;
                    }
                    throw new Error(`Kimi API error: ${response.status} — ${errBody.slice(0, 200)}`);
                }

                const data = await response.json();
                const aiResponse = (data.choices[0].message.content || '').trim();
                
                if (!aiResponse) {
                    lastError = new Error('Empty response from Kimi');
                    continue; // retry
                }
                
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    lastError = new Error('Invalid JSON response');
                    continue; // retry
                }

                const analysis = JSON.parse(jsonMatch[0]);
                return { success: true, analysis };

            } catch (retryErr) {
                lastError = retryErr;
            }
        }
        // All retries failed
        throw lastError || new Error('All retries failed');

    } catch (error) {
        console.error('❌ AI analysis error:', error.message);
        return {
            success: false,
            error: error.message,
            // Fallback analysis
            analysis: {
                lead_score: 50,
                lead_status: 'warm',
                sentiment: 'neutral',
                interest_level: 'medium',
                has_tested_ifg: false,
                key_points: ['Analyse IA non disponible'],
                recommended_action: 'follow_up',
                follow_up_timing: '3_days',
                personalization_hints: [],
                reasoning: 'Analyse par défaut (erreur IA)'
            }
        };
    }
}

/**
 * Generate personalized follow-up message with AI
 */
async function generateFollowUpMessage(prospectName, profileData, conversationHistory, analysis, ifgStatus) {
    try {
        const conversationText = conversationHistory.map(msg => 
            `${msg.sender === 'me' ? 'Moi' : prospectName}: ${msg.content}`
        ).join('\n\n');

        // Determine proper greeting
        const firstName = prospectName.split(' ')[0]; // PRÉNOM = premier mot
        const jobLower = (profileData.job_title || '').toLowerCase();
        const isLawyer = jobLower.includes('avocat') || jobLower.includes('counsel') || jobLower.includes('notaire');
        // Maître pour avocats/notaires, sinon Monsieur/Madame + prénom
        const greeting = isLawyer ? `Maître ${firstName}` : firstName;

        const prompt = `Tu écris un message LinkedIn de relance pour Aitor Garcia, fondateur d'IFG.

IMPORTANT: Lis TOUTE la conversation ci-dessous attentivement avant d'écrire. Le message doit être la suite LOGIQUE de cette conversation.

PROSPECT:
- Nom complet: ${prospectName}
- Prénom: ${firstName}
- Comment s'adresser: "Bonjour ${greeting}" (ou "Bonjour Monsieur/Madame ${firstName}" si tu ne connais pas le genre)
- Poste: ${profileData.job_title || '?'}
- Entreprise: ${profileData.company || '?'}
- Secteur: ${profileData.sector || '?'}
- Score: ${analysis.lead_score}/100 (${analysis.lead_status})
- Intérêt: ${analysis.interest_level}
- Points clés: ${analysis.key_points.join(', ')}
${ifgStatus.has_tested ? '- A DÉJÀ TESTÉ IFG' : ''}
${ifgStatus.is_subscriber ? '- EST ABONNÉ IFG' : ''}

CONVERSATION COMPLÈTE (lis tout attentivement):
${conversationText}

QU'EST-CE QU'IFG:
IFG est un outil de recherche spécialisé en fiscalité. Un copilote qui aide avocats, experts-comptables et fiscalistes à trouver rapidement textes, jurisprudences et doctrines. Ce n'est pas un remplacement, c'est un accélérateur de recherche.

RÈGLES ABSOLUES:
1. COURT : 2-3 phrases max. Un vrai message LinkedIn humain.
2. LANGUE : Écris dans LA MÊME LANGUE que le prospect utilise dans la conversation. Si le prospect écrit en anglais → réponds en anglais. Si en français → en français. TOUJOURS respecter la langue du prospect.
3. POLI ET NATUREL : Écris dans une langue impeccable et naturelle. Pas de formulations maladroites ou robotiques.
4. COMMENCE PAR "Bonjour ${greeting}," (ou "Hello ${firstName}," / "Hi ${firstName}," si en anglais) — JAMAIS par le nom de famille seul.
5. PERSONNALISÉ : Réfère-toi PRÉCISÉMENT à ce qui a été dit dans la conversation. Si le prospect a parlé d'un sujet, rebondis dessus.
6. ADAPTÉ AU PROFIL : Adapte le ton au poste et à l'entreprise du prospect. Un avocat ≠ un consultant ≠ un directeur fiscal.
7. RESPECTUEUX : Jamais de pression, jamais de FOMO, jamais de manipulation.
8. PAS DE CHIFFRES INVENTÉS.
9. PAS D'APPEL TÉLÉPHONIQUE.
10. VOUVOIEMENT en français / formal "you" en anglais.
11. Signe "Aitor" à la fin.
12. Si le prospect travaille dans un domaine qui n'est PAS directement lié à la fiscalité, adapte le message en conséquence (ne force pas IFG si ça ne colle pas).

SELON LE CONTEXTE:
- Prospect intéressé → propose de tester (5 questions gratuites sur ifg.tax)
- Prospect a déjà testé → demande son retour, ce qui lui a plu ou manqué
- Prospect froid / pas répondu → relance douce et courte
- Prospect dans un domaine non-fiscal → sois honnête, demande si la recherche fiscale fait partie de ses missions

Réponds UNIQUEMENT avec le message. Rien d'autre.`;

        const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIMI_API_KEY}`
            },
            body: JSON.stringify({
                model: KIMI_MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 1,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            throw new Error(`Kimi API error: ${response.status}`);
        }

        const data = await response.json();
        const message = data.choices[0].message.content.trim();

        return {
            success: true,
            message
        };

    } catch (error) {
        console.error('❌ Message generation error:', error.message);
        return {
            success: false,
            error: error.message,
            message: `Bonjour ${prospectName},\n\nJ'espère que vous allez bien. Je me permets de revenir vers vous concernant IFG.\n\nSeriez-vous disponible pour échanger rapidement ?\n\nBien à vous,\nAitor`
        };
    }
}

module.exports = {
    analyzeConversation,
    generateFollowUpMessage
};
