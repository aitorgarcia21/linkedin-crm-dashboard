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
            console.error(`❌ Kimi API ${response.status} response:`, errBody.slice(0, 500));
            throw new Error(`Kimi API error: ${response.status} ${response.statusText} — ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        // Kimi K2.5 puts thinking in reasoning_content and answer in content
        const aiResponse = (data.choices[0].message.content || '').trim();
        
        if (!aiResponse) {
            throw new Error('Empty response from Kimi (reasoning only, no content)');
        }
        
        // Parse JSON response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Invalid JSON response from AI');
        }

        const analysis = JSON.parse(jsonMatch[0]);
        
        return {
            success: true,
            analysis
        };

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

        // Determine proper title based on job
        const isLawyer = profileData.job_title?.toLowerCase().includes('avocat') || 
                        profileData.job_title?.toLowerCase().includes('counsel');
        const title = isLawyer ? 'Maître' : prospectName.split(' ').pop(); // Last name for non-lawyers

        const prompt = `Tu écris un message LinkedIn de relance pour Aitor Garcia, fondateur d'IFG.

PROSPECT:
- Nom: ${prospectName} (appelle-le "${title}")
- Poste: ${profileData.job_title || '?'}
- Entreprise: ${profileData.company || '?'}
- Secteur: ${profileData.sector || '?'}
- Score: ${analysis.lead_score}/100 (${analysis.lead_status})
- Intérêt: ${analysis.interest_level}
- Points clés conversation: ${analysis.key_points.join(', ')}
${ifgStatus.has_tested ? '- A DÉJÀ TESTÉ IFG' : ''}
${ifgStatus.is_subscriber ? '- EST ABONNÉ IFG' : ''}

CONVERSATION PRÉCÉDENTE:
${conversationText}

QU'EST-CE QU'IFG:
IFG est un outil de recherche spécialisé en fiscalité. C'est un assistant qui aide les professionnels (avocats, experts-comptables, fiscalistes) à trouver rapidement les textes, jurisprudences et doctrines pertinents. Ce n'est PAS un remplacement — c'est un copilote qui accélère leur travail de recherche.

RÈGLES ABSOLUES DU MESSAGE:
1. COURT : 2-3 phrases maximum. Comme un vrai message LinkedIn entre humains.
2. NATUREL : Écris comme un humain, pas comme un robot commercial. Pas de formules toutes faites.
3. PERSONNALISÉ : Réfère-toi à ce qui a été dit dans la conversation. Reprends le fil naturellement.
4. RESPECTUEUX : Jamais de pression, jamais de FOMO, jamais de manipulation. Pas de "vos confrères font déjà X".
5. PAS DE CHIFFRES INVENTÉS : Ne dis pas "10-15h/semaine" ou "30 secondes". Pas de stats sorties de nulle part.
6. PAS D'APPEL TÉLÉPHONIQUE : Ne propose jamais d'appel.
7. SIMPLE : Une question ouverte ou une proposition concrète. Pas de pitch.
8. VOUVOIEMENT toujours.
9. Signe "Aitor" à la fin.

SELON LE CONTEXTE:
- Si le prospect a montré de l'intérêt → propose simplement de tester avec 5 questions gratuites
- Si le prospect a déjà testé → demande son retour d'expérience, ce qui lui a plu ou manqué
- Si le prospect est froid → rebondis sur un élément de son profil ou de la conversation, pose une question sincère
- Si le prospect n'a pas répondu → message ultra court, juste une relance douce ("${title}, est-ce que vous avez eu le temps d'y jeter un œil ?")

EXEMPLES DE BON TON:
- "Bonjour ${title}, suite à notre échange, je me demandais si vous aviez eu l'occasion de tester. N'hésitez pas si vous avez des questions. Aitor"
- "${title}, j'espère que tout va bien. Je reste disponible si le sujet recherche fiscale revient sur la table. Aitor"
- "Bonjour ${title}, votre remarque sur [sujet de la conv] m'a fait réfléchir. On a justement travaillé là-dessus. Ça vous dit d'essayer ? Aitor"

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
