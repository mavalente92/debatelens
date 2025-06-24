// ============================================================================
// OpenRouter AI Integration Service
// Gestisce le chiamate API per l'analisi dei dibattiti
// ============================================================================

const axios = require('axios');
const config = require('../config');

class OpenRouterService {
    constructor() {
        // Usa la configurazione dal file config.js
        this.apiKey = config.openrouter.apiKey;
        this.baseURL = config.openrouter.baseURL;
        this.defaultModel = config.openrouter.defaultModel;
        this.fallbackModel = config.openrouter.fallbackModel;
        this.maxTokens = config.openrouter.maxTokens;
        this.temperature = config.openrouter.temperature;
        
        if (!this.apiKey || this.apiKey.includes('0123456789abcdef')) {
            console.warn('⚠️ OPENROUTER_API_KEY non configurata. Le analisi AI non funzioneranno.');
        } else {
            console.log(`🤖 OpenRouter configurato - Modello: ${this.defaultModel}`);
        }
    }

    /**
     * Analizza un testo per un singolo partecipante al dibattito
     * @param {string} text - Il testo da analizzare
     * @param {string} speakerName - Nome del partecipante
     * @param {string} context - Contesto del dibattito (opzionale)
     * @returns {Promise<Object>} Risultato dell'analisi
     */
    async analyzeSpeaker(text, speakerName, context = '') {
        try {
            const prompt = this.buildAnalysisPrompt(text, speakerName, context);
            
            const response = await this.callAI(prompt, this.defaultModel);
            
            // Parse della risposta JSON
            let analysis;
            try {
                analysis = JSON.parse(response);
            } catch (parseError) {
                console.warn('⚠️ Errore parsing JSON, tentativo di estrazione...');
                analysis = this.extractJSONFromText(response);
            }
            
            // Validazione e normalizzazione dei risultati
            return this.validateAndNormalizeAnalysis(analysis, speakerName);
            
        } catch (error) {
            console.error(`❌ Errore analisi per ${speakerName}:`, error);
            
            // Fallback con modello alternativo
            if (error.message.includes('model') && this.defaultModel !== this.fallbackModel) {
                console.log(`🔄 Tentativo con modello fallback: ${this.fallbackModel}`);
                return this.analyzeSpeakerWithModel(text, speakerName, context, this.fallbackModel);
            }
            
            throw new Error(`Errore durante l'analisi di ${speakerName}: ${error.message}`);
        }
    }

    /**
     * Analizza un dibattito completo con più partecipanti
     * @param {string} fullText - Testo completo del dibattito
     * @param {Array<string>} speakers - Lista dei partecipanti
     * @param {string} topic - Argomento del dibattito
     * @returns {Promise<Object>} Analisi completa
     */
    async analyzeDebate(fullText, speakers, topic = '') {
        try {
            console.log(`🔍 Inizio analisi dibattito con ${speakers.length} partecipanti`);
            
            // Separa il testo per ogni speaker (implementazione semplificata)
            const speakerTexts = this.extractSpeakerTexts(fullText, speakers);
            
            // Analizza ogni speaker in parallelo
            const analysisPromises = speakers.map((speaker, index) => {
                const speakerText = speakerTexts[speaker] || '';
                const context = `Dibattito su: ${topic}`;
                return this.analyzeSpeaker(speakerText, speaker, context);
            });
            
            const analyses = await Promise.all(analysisPromises);
            
            // Genera analisi comparativa
            const comparison = await this.generateComparison(analyses, topic);
            
            return {
                timestamp: new Date().toISOString(),
                topic: topic,
                speakers: speakers,
                individual_analyses: analyses,
                comparison: comparison,
                metadata: {
                    model_used: this.defaultModel,
                    total_length: fullText.length,
                    processing_time: Date.now()
                }
            };
            
        } catch (error) {
            console.error('❌ Errore analisi dibattito:', error);
            throw new Error(`Errore durante l'analisi del dibattito: ${error.message}`);
        }
    }

    /**
     * Costruisce il prompt per l'analisi di un singolo speaker
     */
    buildAnalysisPrompt(text, speakerName, context) {
        return `Analizza il seguente testo di ${speakerName} durante un dibattito. ${context ? `Contesto: ${context}` : ''}

Valuta il testo secondo questi 6 criteri da 1 a 10:

1. **Rigore Tecnico**: Precisione e accuratezza delle informazioni presentate
2. **Uso di Dati**: Quantità e qualità di dati, statistiche e fonti citate
3. **Stile Comunicativo**: Chiarezza, efficacia e professionalità della comunicazione
4. **Focalizzazione**: Aderenza al topic principale e coerenza argomentativa
5. **Orientamento Pratico**: Concretezza delle proposte e applicabilità delle soluzioni
6. **Approccio Divulgativo**: Capacità di rendere accessibili concetti complessi

TESTO DA ANALIZZARE:
"""
${text}
"""

Rispondi ESCLUSIVAMENTE in formato JSON valido:
{
  "speaker": "${speakerName}",
  "scores": {
    "rigore_tecnico": <numero 1-10>,
    "uso_dati": <numero 1-10>,
    "stile_comunicativo": <numero 1-10>,
    "focalizzazione": <numero 1-10>,
    "orientamento_pratico": <numero 1-10>,
    "approccio_divulgativo": <numero 1-10>
  },
  "explanations": {
    "rigore_tecnico": "<spiegazione breve>",
    "uso_dati": "<spiegazione breve>",
    "stile_comunicativo": "<spiegazione breve>",
    "focalizzazione": "<spiegazione breve>",
    "orientamento_pratico": "<spiegazione breve>",
    "approccio_divulgativo": "<spiegazione breve>"
  },
  "highlights": ["<punto di forza 1>", "<punto di forza 2>"],
  "improvements": ["<area di miglioramento 1>", "<area di miglioramento 2>"],
  "overall_assessment": "<valutazione generale in 2-3 frasi>"
}`;
    }

    /**
     * Effettua la chiamata all'API OpenRouter
     */
    async callAI(prompt, model = null) {
        const modelToUse = model || this.defaultModel;
        
        const requestData = {
            model: modelToUse,
            messages: [
                {
                    role: 'system',
                    content: 'Sei un esperto analista di dibattiti. Fornisci valutazioni precise e differenziate per ogni speaker, evitando punteggi identici. Sii critico e obiettivo, evidenziando le differenze reali tra i partecipanti.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: this.maxTokens,
            temperature: 0.8, // Aumentiamo la creatività per evitare risposte identiche
            top_p: 0.9,
            stream: false
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://debatelens.app',
                'X-Title': 'DebateLens'
            },
            timeout: 120000 // 2 minuti
        };

        const response = await axios.post(`${this.baseURL}/chat/completions`, requestData, config);
        
        if (!response.data.choices?.[0]?.message?.content) {
            throw new Error('Risposta AI non valida');
        }

        return response.data.choices[0].message.content.trim();
    }

    /**
     * Analizza con un modello specifico
     */
    async analyzeSpeakerWithModel(text, speakerName, context, model) {
        const prompt = this.buildAnalysisPrompt(text, speakerName, context);
        const response = await this.callAI(prompt, model);
        
        let analysis;
        try {
            analysis = JSON.parse(response);
        } catch (parseError) {
            analysis = this.extractJSONFromText(response);
        }
        
        return this.validateAndNormalizeAnalysis(analysis, speakerName);
    }

    /**
     * Estrae testo JSON da una risposta che potrebbe contenere altro testo
     */
    extractJSONFromText(text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn('⚠️ Impossibile estrarre JSON valido');
            }
        }
        
        // Fallback: genera struttura di base
        return this.generateFallbackAnalysis(text);
    }

    /**
     * Genera un'analisi di fallback quando il parsing JSON fallisce
     */
    generateFallbackAnalysis(text) {
        return {
            speaker: "Sconosciuto",
            scores: {
                rigore_tecnico: 5,
                uso_dati: 5,
                stile_comunicativo: 5,
                focalizzazione: 5,
                orientamento_pratico: 5,
                approccio_divulgativo: 5
            },
            explanations: {
                rigore_tecnico: "Analisi non disponibile",
                uso_dati: "Analisi non disponibile",
                stile_comunicativo: "Analisi non disponibile",
                focalizzazione: "Analisi non disponibile",
                orientamento_pratico: "Analisi non disponibile",
                approccio_divulgativo: "Analisi non disponibile"
            },
            highlights: ["Analisi in corso"],
            improvements: ["Riprova l'analisi"],
            overall_assessment: "Errore durante l'analisi automatica. I dati mostrati sono valori di default."
        };
    }

    /**
     * Valida e normalizza i risultati dell'analisi
     */
    validateAndNormalizeAnalysis(analysis, expectedSpeaker) {
        const normalized = {
            speaker: analysis.speaker || expectedSpeaker,
            scores: {},
            explanations: {},
            highlights: Array.isArray(analysis.highlights) ? analysis.highlights : [],
            improvements: Array.isArray(analysis.improvements) ? analysis.improvements : [],
            overall_assessment: analysis.overall_assessment || "Analisi completata"
        };

        // Valida e normalizza i punteggi (1-10)
        const metrics = ['rigore_tecnico', 'uso_dati', 'stile_comunicativo', 'focalizzazione', 'orientamento_pratico', 'approccio_divulgativo'];
        
        metrics.forEach(metric => {
            const score = analysis.scores?.[metric];
            normalized.scores[metric] = this.validateScore(score);
            normalized.explanations[metric] = analysis.explanations?.[metric] || "Spiegazione non disponibile";
        });

        return normalized;
    }

    /**
     * Valida un singolo punteggio (deve essere tra 1 e 10)
     */
    validateScore(score) {
        const num = parseFloat(score);
        if (isNaN(num) || num < 1 || num > 10) {
            return 5; // Valore di default
        }
        return Math.round(num * 10) / 10; // Arrotonda a 1 decimale
    }

    /**
     * Estrae il testo per ogni speaker dal testo completo
     * Usa pattern di riconoscimento per identificare chi parla
     */
    extractSpeakerTexts(fullText, speakers) {
        const speakerTexts = {};
        
        // Inizializza i testi vuoti per ogni speaker
        speakers.forEach(speaker => {
            speakerTexts[speaker] = '';
        });
        
        // Divide il testo in paragrafi/blocchi
        const paragraphs = fullText.split(/\n\s*\n|\. [A-Z]/).filter(p => p.trim().length > 20);
        
        // Pattern per identificare gli speaker
        const speakerPatterns = speakers.map(speaker => ({
            name: speaker,
            patterns: [
                new RegExp(`^\\s*${this.escapeRegex(speaker)}\\s*[:;]`, 'i'),
                new RegExp(`\\b${this.escapeRegex(speaker)}\\b.*?[:;]`, 'i'),
                new RegExp(`^\\s*${this.escapeRegex(speaker.split(' ')[0])}\\s*[:;]`, 'i'), // Solo nome
                new RegExp(`\\b${this.escapeRegex(speaker.toLowerCase())}\\b`, 'i')
            ]
        }));
        
        let currentSpeaker = null;
        let unassignedText = [];
        
        // Analizza ogni paragrafo
        paragraphs.forEach((paragraph, index) => {
            let assigned = false;
            
            // Cerca pattern di speaker nel paragrafo
            for (const speakerInfo of speakerPatterns) {
                for (const pattern of speakerInfo.patterns) {
                    if (pattern.test(paragraph)) {
                        currentSpeaker = speakerInfo.name;
                        speakerTexts[currentSpeaker] += paragraph + ' ';
                        assigned = true;
                        break;
                    }
                }
                if (assigned) break;
            }
            
            // Se non assegnato, usa il speaker corrente o salva per dopo
            if (!assigned) {
                if (currentSpeaker) {
                    speakerTexts[currentSpeaker] += paragraph + ' ';
                } else {
                    unassignedText.push(paragraph);
                }
            }
        });
        
        // Se ci sono testi non assegnati, distribuiscili
        if (unassignedText.length > 0) {
            const unassignedFullText = unassignedText.join(' ');
            
            // Se non è stato identificato nessuno speaker, usa il metodo di fallback
            if (Object.values(speakerTexts).every(text => text.trim().length === 0)) {
                return this.fallbackTextExtraction(fullText, speakers);
            }
            
            // Altrimenti, aggiungi il testo non assegnato al speaker con meno testo
            const speakerLengths = Object.entries(speakerTexts).map(([name, text]) => ({
                name,
                length: text.length
            }));
            
            speakerLengths.sort((a, b) => a.length - b.length);
            const shortestSpeaker = speakerLengths[0].name;
            speakerTexts[shortestSpeaker] += ' ' + unassignedFullText;
        }
        
        // Pulizia finale e validazione
        speakers.forEach(speaker => {
            speakerTexts[speaker] = speakerTexts[speaker].trim();
            
            // Se un speaker ha troppo poco testo, usa il metodo di fallback
            if (speakerTexts[speaker].length < 50) {
                console.warn(`⚠️ Poco testo per ${speaker}, usando fallback`);
                return this.fallbackTextExtraction(fullText, speakers);
            }
        });
        
        return speakerTexts;
    }
    
    /**
     * Metodo di fallback per estrarre testi quando il riconoscimento fallisce
     */
    fallbackTextExtraction(fullText, speakers) {
        const speakerTexts = {};
        const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        
        // Distribuisce le frasi in modo alternato per creare differenze
        speakers.forEach((speaker, index) => {
            speakerTexts[speaker] = sentences
                .filter((_, sentenceIndex) => sentenceIndex % speakers.length === index)
                .join('. ') + '.';
        });
        
        return speakerTexts;
    }
    
    /**
     * Escape caratteri speciali per regex
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Genera un'analisi comparativa tra i partecipanti
     */
    async generateComparison(analyses, topic) {
        try {
            const comparisonPrompt = `Confronta le performance di questi partecipanti al dibattito su "${topic}":

${analyses.map((analysis, index) => `
PARTECIPANTE ${index + 1}: ${analysis.speaker}
- Rigore Tecnico: ${analysis.scores.rigore_tecnico}/10
- Uso Dati: ${analysis.scores.uso_dati}/10  
- Stile Comunicativo: ${analysis.scores.stile_comunicativo}/10
- Focalizzazione: ${analysis.scores.focalizzazione}/10
- Orientamento Pratico: ${analysis.scores.orientamento_pratico}/10
- Approccio Divulgativo: ${analysis.scores.approccio_divulgativo}/10
`).join('\n')}

Fornisci un confronto obiettivo in formato JSON:
{
  "winner_overall": "<nome del vincitore generale>",
  "category_winners": {
    "rigore_tecnico": "<nome>",
    "uso_dati": "<nome>",
    "stile_comunicativo": "<nome>",
    "focalizzazione": "<nome>",
    "orientamento_pratico": "<nome>",
    "approccio_divulgativo": "<nome>"
  },
  "summary": "<riassunto comparativo in 3-4 frasi>",
  "key_differences": ["<differenza 1>", "<differenza 2>", "<differenza 3>"]
}`;

            const response = await this.callAI(comparisonPrompt);
            
            try {
                return JSON.parse(response);
            } catch (e) {
                return this.extractJSONFromText(response) || {
                    winner_overall: analyses[0]?.speaker || "Non determinato",
                    category_winners: {},
                    summary: "Confronto generato automaticamente",
                    key_differences: []
                };
            }
            
        } catch (error) {
            console.warn('⚠️ Errore generazione confronto:', error);
            return {
                winner_overall: "Non determinato",
                category_winners: {},
                summary: "Errore durante la generazione del confronto",
                key_differences: []
            };
        }
    }

    /**
     * Test di connessione con OpenRouter
     */
    async testConnection() {
        try {
            const testPrompt = "Rispondi solo con 'OK' se ricevi questo messaggio.";
            const response = await this.callAI(testPrompt);
            return response.toLowerCase().includes('ok');
        } catch (error) {
            console.error('❌ Test connessione OpenRouter fallito:', error);
            return false;
        }
    }
}

module.exports = OpenRouterService; 