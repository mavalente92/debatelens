// ============================================================================
// Analysis Routes - Gestisce le richieste di analisi dei dibattiti
// ============================================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../utils/database');
const OpenRouterService = require('../services/openrouter');
const TranscriptionService = require('../services/transcription');

const router = express.Router();

// Inizializza i servizi
const openRouterService = new OpenRouterService();
const transcriptionService = new TranscriptionService();

// ============================================================================
// POST /api/analysis/text - Analisi di testo diretto
// ============================================================================

router.post('/text', async (req, res) => {
    try {
        const { text, speakers, topic, title } = req.body;

        // Validazione input
        if (!text || !speakers || !Array.isArray(speakers) || speakers.length === 0) {
            return res.status(400).json({
                error: 'Parametri mancanti: text, speakers sono obbligatori'
            });
        }

        if (text.length < 100) {
            return res.status(400).json({
                error: 'Il testo deve essere di almeno 100 caratteri'
            });
        }

        if (speakers.length < 1 || speakers.length > 10) {
            return res.status(400).json({
                error: 'Numero di speaker deve essere tra 1 e 10'
            });
        }

        const analysisId = uuidv4();
        const db = getDatabase();

        // Crea record nel database
        await db.createAnalysis({
            id: analysisId,
            title: title || `Analisi ${new Date().toLocaleDateString('it-IT')}`,
            topic: topic || '',
            sourceType: 'text',
            sourceData: text.substring(0, 500) + '...', // Salva solo un estratto
            speakers: speakers,
            metadata: {
                text_length: text.length,
                processing_started: new Date().toISOString()
            }
        });

        // Aggiorna status a processing
        await db.updateAnalysisStatus(analysisId, 'processing');

        // Inizia analisi in background
        processTextAnalysis(analysisId, text, speakers, topic)
            .catch(error => {
                console.error(`❌ Errore analisi ${analysisId}:`, error);
                db.updateAnalysisStatus(analysisId, 'error', error.message);
            });

        res.json({
            success: true,
            analysis_id: analysisId,
            status: 'processing',
            message: 'Analisi avviata. Controlla lo stato con GET /api/analysis/:id'
        });

    } catch (error) {
        console.error('❌ Errore endpoint /text:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// POST /api/analysis/youtube - Analisi di video YouTube
// ============================================================================

router.post('/youtube', async (req, res) => {
    try {
        const { url, speakers, topic, title, language = 'it' } = req.body;

        // Validazione input
        if (!url || !speakers || !Array.isArray(speakers)) {
            return res.status(400).json({
                error: 'Parametri mancanti: url, speakers sono obbligatori'
            });
        }

        // Valida URL YouTube
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
        if (!youtubeRegex.test(url)) {
            return res.status(400).json({
                error: 'URL YouTube non valido'
            });
        }

        const analysisId = uuidv4();
        const db = getDatabase();

        // Crea record nel database
        await db.createAnalysis({
            id: analysisId,
            title: title || `Video YouTube - ${new Date().toLocaleDateString('it-IT')}`,
            topic: topic || '',
            sourceType: 'youtube',
            sourceData: url,
            speakers: speakers,
            metadata: {
                youtube_url: url,
                language: language,
                processing_started: new Date().toISOString()
            }
        });

        await db.updateAnalysisStatus(analysisId, 'processing');

        // Inizia analisi in background
        processYouTubeAnalysis(analysisId, url, speakers, topic, language)
            .catch(error => {
                console.error(`❌ Errore analisi YouTube ${analysisId}:`, error);
                db.updateAnalysisStatus(analysisId, 'error', error.message);
            });

        res.json({
            success: true,
            analysis_id: analysisId,
            status: 'processing',
            message: 'Analisi video YouTube avviata. La trascrizione potrebbe richiedere alcuni minuti.'
        });

    } catch (error) {
        console.error('❌ Errore endpoint /youtube:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/analysis/:id - Ottiene lo stato e i risultati di un'analisi
// ============================================================================

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const analysis = await db.getAnalysis(id);

        if (!analysis) {
            return res.status(404).json({
                error: 'Analisi non trovata'
            });
        }

        // Formatta la risposta in base allo status
        const response = {
            id: analysis.id,
            title: analysis.title,
            topic: analysis.topic,
            source_type: analysis.source_type,
            speakers: analysis.speakers,
            status: analysis.status,
            created_at: analysis.created_at,
            updated_at: analysis.updated_at
        };

        if (analysis.status === 'error') {
            response.error_message = analysis.error_message;
        }

        if (analysis.status === 'completed') {
            response.completed_at = analysis.completed_at;
            response.results = {
                speaker_analyses: analysis.speaker_analyses?.map(speaker => ({
                    speaker: speaker.speaker_name,
                    scores: {
                        rigore_tecnico: speaker.rigore_tecnico,
                        uso_dati: speaker.uso_dati,
                        stile_comunicativo: speaker.stile_comunicativo,
                        focalizzazione: speaker.focalizzazione,
                        orientamento_pratico: speaker.orientamento_pratico,
                        approccio_divulgativo: speaker.approccio_divulgativo
                    },
                    explanations: speaker.explanations,
                    highlights: speaker.highlights,
                    improvements: speaker.improvements,
                    overall_assessment: speaker.overall_assessment
                })) || [],
                comparison: analysis.comparison || null,
                transcription: analysis.transcription ? {
                    text: analysis.transcription.text,
                    language: analysis.transcription.language,
                    duration: analysis.transcription.duration
                } : null
            };
        }

        res.json(response);

    } catch (error) {
        console.error('❌ Errore GET /:id:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/analysis - Lista delle analisi con paginazione
// ============================================================================

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 per pagina
        const status = req.query.status || null;

        const db = getDatabase();
        const result = await db.getAnalysesList(page, limit, status);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('❌ Errore GET /:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// DELETE /api/analysis/:id - Elimina un'analisi
// ============================================================================

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const analysis = await db.getAnalysis(id);
        if (!analysis) {
            return res.status(404).json({
                error: 'Analisi non trovata'
            });
        }

        await db.deleteAnalysis(id);

        res.json({
            success: true,
            message: 'Analisi eliminata correttamente'
        });

    } catch (error) {
        console.error('❌ Errore DELETE /:id:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// POST /api/analysis/:id/regenerate - Rigenera un'analisi
// ============================================================================

router.post('/:id/regenerate', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const analysis = await db.getAnalysis(id);
        if (!analysis) {
            return res.status(404).json({
                error: 'Analisi non trovata'
            });
        }

        if (analysis.status === 'processing') {
            return res.status(400).json({
                error: 'Analisi già in corso'
            });
        }

        // Reset status
        await db.updateAnalysisStatus(id, 'processing');

        // Riavvia analisi in base al tipo
        if (analysis.source_type === 'text') {
            // Per testo diretto, riutilizza la trascrizione se esiste
            const text = analysis.transcription ? analysis.transcription.text : analysis.source_data;
            processTextAnalysis(id, text, analysis.speakers, analysis.topic)
                .catch(error => {
                    console.error(`❌ Errore rigenerazione ${id}:`, error);
                    db.updateAnalysisStatus(id, 'error', error.message);
                });
        } else if (analysis.source_type === 'youtube') {
            const metadata = analysis.metadata || {};
            processYouTubeAnalysis(id, analysis.source_data, analysis.speakers, analysis.topic, metadata.language)
                .catch(error => {
                    console.error(`❌ Errore rigenerazione YouTube ${id}:`, error);
                    db.updateAnalysisStatus(id, 'error', error.message);
                });
        }

        res.json({
            success: true,
            message: 'Rigenerazione avviata'
        });

    } catch (error) {
        console.error('❌ Errore POST /:id/regenerate:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// Funzioni di Elaborazione in Background
// ============================================================================

/**
 * Elabora un'analisi di testo
 */
async function processTextAnalysis(analysisId, text, speakers, topic) {
    const db = getDatabase();
    
    try {
        console.log(`🔍 Inizio elaborazione analisi testo: ${analysisId}`);

        // Salva la "trascrizione" (che è già testo)
        await db.saveTranscription({
            analysisId,
            text,
            language: 'it',
            duration: null,
            source: 'text'
        });

        // Effettua l'analisi AI
        const analysis = await openRouterService.analyzeDebate(text, speakers, topic);

        // Salva i risultati nel database
        await saveAnalysisResults(analysisId, analysis);

        console.log(`✅ Analisi completata: ${analysisId}`);

    } catch (error) {
        console.error(`❌ Errore elaborazione testo ${analysisId}:`, error);
        throw error;
    }
}

/**
 * Elabora un'analisi di video YouTube
 */
async function processYouTubeAnalysis(analysisId, youtubeUrl, speakers, topic, language) {
    const db = getDatabase();
    
    try {
        console.log(`📺 Inizio elaborazione video YouTube: ${analysisId}`);

        // Step 1: Trascrizione
        console.log(`🎙️ Trascrizione video YouTube...`);
        const transcriptionResult = await transcriptionService.transcribeYouTubeVideo(youtubeUrl, language);

        if (!transcriptionResult.success || !transcriptionResult.text) {
            throw new Error('Trascrizione fallita o testo vuoto');
        }

        // Salva trascrizione
        await db.saveTranscription({
            analysisId,
            text: transcriptionResult.text,
            language: transcriptionResult.language,
            duration: transcriptionResult.duration,
            source: 'youtube'
        });

        // Step 2: Analisi AI
        console.log(`🤖 Analisi AI del testo trascritto...`);
        const analysis = await openRouterService.analyzeDebate(transcriptionResult.text, speakers, topic);

        // Salva i risultati
        await saveAnalysisResults(analysisId, analysis);

        console.log(`✅ Analisi YouTube completata: ${analysisId}`);

    } catch (error) {
        console.error(`❌ Errore elaborazione YouTube ${analysisId}:`, error);
        throw error;
    }
}

/**
 * Salva i risultati dell'analisi nel database
 */
async function saveAnalysisResults(analysisId, analysis) {
    const db = getDatabase();

    try {
        // Salva analisi per ogni speaker
        for (const speakerAnalysis of analysis.individual_analyses) {
            await db.saveSpeakerAnalysis(analysisId, speakerAnalysis);
        }

        // Salva confronto
        if (analysis.comparison) {
            await db.saveComparison(analysisId, analysis.comparison);
        }

        // Aggiorna status a completato
        await db.updateAnalysisStatus(analysisId, 'completed');

        console.log(`✅ Risultati salvati per analisi: ${analysisId}`);

    } catch (error) {
        console.error(`❌ Errore salvataggio risultati ${analysisId}:`, error);
        throw error;
    }
}

// ============================================================================
// Endpoint di Test
// ============================================================================

router.get('/test/connection', async (req, res) => {
    try {
        const openRouterTest = await openRouterService.testConnection();
        const transcriptionTest = await transcriptionService.testConnection();

        res.json({
            success: true,
            services: {
                openrouter: openRouterTest,
                transcription: transcriptionTest
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Errore test connessione:', error);
        res.status(500).json({
            error: 'Errore test connessione',
            details: error.message
        });
    }
});

module.exports = router; 