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

        const prompt = `Tu es un assistant commercial expert pour IFG, un système de recherche adapté pour la fiscalité.

Analyse cette conversation LinkedIn et fournis une évaluation structurée :

CONVERSATION:
${conversationText}

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
  "follow_up_timing": "<immediate|3_days|1_week|none>",
  "personalization_hints": ["élément1 à personnaliser", "élément2"],
  "reasoning": "Explication courte de ton analyse"
}

CRITÈRES DE SCORING (seulement si pertinent):
- Hot (80-100): Intérêt explicite, questions précises, demande de test/démo
- Warm (50-79): Réponse positive, curiosité, mais pas d'engagement immédiat
- Cold (0-49): Pas de réponse, réponse négative, ou pas d'intérêt
- Si NON PERTINENT: lead_score = 0, lead_status = "cold", recommended_action = "ignore"

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
                temperature: 0.3,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            throw new Error(`Kimi API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content.trim();
        
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

        const prompt = `Tu es Aitor Garcia, fondateur d'IFG (système de recherche adapté pour la fiscalité).

CONTEXTE:
Prospect: ${prospectName}
Titre à utiliser: ${title}
Poste: ${profileData.job_title || 'Non spécifié'}
Entreprise: ${profileData.company || 'Non spécifié'}
Secteur: ${profileData.sector || 'Non spécifié'}
Statut IFG: ${ifgStatus.has_tested ? 'A testé IFG' : 'N\'a jamais testé'}
${ifgStatus.is_subscriber ? 'ABONNÉ IFG' : ''}

ANALYSE DU LEAD:
Score: ${analysis.lead_score}/100 (${analysis.lead_status})
Intérêt: ${analysis.interest_level}
Points clés: ${analysis.key_points.join(', ')}

CONVERSATION PRÉCÉDENTE:
${conversationText}

POSITIONNEMENT IFG (CRUCIAL):
- IFG est un COPILOTE, pas un remplacement de l'expert
- C'est un système de recherche spécialisé pour la fiscalité
- Produit INCROYABLE qui transforme la recherche fiscale
- On doit TOUT GAGNER avec ce produit - chaque message doit closer

PSYCHOLOGIE DE VENTE AVANCÉE:
- Crée du FOMO (peur de rater quelque chose)
- Utilise la preuve sociale (autres fiscalistes qui utilisent IFG)
- Montre la valeur immédiate et concrète
- Crée de l'urgence sans être insistant
- Pose des questions qui font réfléchir le prospect
- Utilise des chiffres concrets (gain de temps, précision)

TECHNIQUES DE CLOSING:
- Assume que le prospect va tester (pas "si" mais "quand")
- Réduis la friction au maximum (5 questions gratuites = zéro risque)
- Crée un sentiment d'exclusivité
- Montre que tu comprends VRAIMENT ses problèmes métier
- Utilise des success stories subtiles

CONSIGNES STRICTES:
1. Message COURT (3-4 lignes max) mais PERCUTANT
2. Utilise "${title}" (Maître si avocat, nom de famille sinon)
3. Ton ULTRA MALIN, COMMERCIAL et ADAPTÉ à l'interlocuteur
4. Personnalisation EXTRÊME avec profil + conversation
5. Appel à l'action CLAIR et IRRÉSISTIBLE
6. JAMAIS proposer d'appel téléphonique
7. IFG = copilote qui DÉCUPLE leur efficacité
8. Système de recherche qui fait gagner 10-15h/semaine
9. Ne mentionne PAS l'IA
10. Si testé IFG: demande retour + propose accompagnement premium
11. Si abonné: remercie + propose optimisation/formation
12. Utilise des chiffres concrets (temps gagné, précision, sources)
13. Crée du FOMO: "Plusieurs fiscalistes de [secteur] l'utilisent déjà"
14. Question finale qui force la réflexion

FRAMEWORKS DE VENTE AVANCÉS (YC + TOP B2B SaaS):

1. CHALLENGER SALE (Commercial Teaching):
   - WARMER: Décris leur problème pour qu'ils hochent la tête
   - REFRAME: Donne un insight qu'ils n'avaient pas considéré
   - RATIONAL DROWNING: Chiffre le coût (15h/semaine = 780h/an perdues)
   - EMOTIONAL IMPACT: Histoire d'un confrère qui a souffert du même problème
   - NEW WAY: Montre le nouveau comportement à adopter
   - SOLUTION: IFG comme enabler de ce nouveau comportement

2. SPIN SELLING (Questions Stratégiques):
   - SITUATION: "Combien de temps passez-vous sur la recherche fiscale ?"
   - PROBLEM: "Quelle est votre plus grande frustration ?"
   - IMPLICATION: "Quel impact sur votre rentabilité ?"
   - NEED-PAYOFF: "Que changerait un gain de 10-15h/semaine ?"

3. SECRETS YC B2B SaaS:
   - Questions simples qui déclenchent conversations (pas pitchs)
   - Humanise: langage naturel, imperfections volontaires
   - Social proof spécifique au secteur
   - Premier message long, follow-up ultra court ("${title} ?")
   - Valeur gratuite upfront (5 questions = zéro risque)
   - CTA sans friction (assume qu'ils vont tester)
   - Personnalisation EXTRÊME (pas générique)
   - FOMO subtil mais puissant
   - Question finale qui force réflexion

4. PSYCHOLOGIE DE CONVERSION:
   - Scarcité: "Places limitées pour fiscalistes de votre secteur"
   - Social Proof: "Plus de 50 fiscalistes l'utilisent quotidiennement"
   - Réciprocité: Donne avant de demander
   - Loss Aversion: "Pendant que vous cherchez, vos confrères gagnent 15h/semaine"

5. STRUCTURE MESSAGE PARFAITE:
   HOOK (3 sec): Question provocante OU stat surprenante OU observation spécifique
   VALUE PROP: IFG = copilote qui [bénéfice] en [temps gagné]
   SOCIAL PROOF: Utilisateurs similaires + résultats concrets
   CTA: Zéro engagement, spécifique, question-based

EXEMPLES DE HOOKS ULTRA PUISSANTS:
- "${title}, 15h/semaine de recherche en moins, ça changerait quoi pour vous ?"
- "J'ai remarqué votre expertise en [domaine] chez [entreprise] - exactement le profil qui tire le max d'IFG"
- "Plusieurs fiscalistes de [secteur] m'ont dit la même chose : 'Pourquoi j'ai attendu si longtemps ?'"
- "Pendant que vous lisez ceci, un confrère vient de trouver 5 jurisprudences en 30 secondes avec IFG"
- "Votre expertise en [domaine] + IFG = vous devenez imbattable"
- "Question rapide : combien de temps avez-vous perdu cette semaine à chercher dans 10 sources différentes ?"

Réponds UNIQUEMENT avec le message, sans introduction ni conclusion.`;

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
                temperature: 0.7,
                max_tokens: 500
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
