// ============================================================================
// Upload Routes - Gestisce l'upload di file video/audio
// ============================================================================

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../utils/database');
const TranscriptionService = require('../services/transcription');
const OpenRouterService = require('../services/openrouter');

const router = express.Router();

// Inizializza i servizi
const transcriptionService = new TranscriptionService();
const openRouterService = new OpenRouterService();

// ============================================================================
// Configurazione Multer per Upload
// ============================================================================

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        try {
            await fs.access(uploadDir);
        } catch {
            await fs.mkdir(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    // Accetta solo file video e audio
    const allowedMimes = [
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/webm',
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/flac',
        'audio/m4a',
        'audio/ogg'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Formato file non supportato: ${file.mimetype}. Formati supportati: ${allowedMimes.join(', ')}`), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 1 // Un file alla volta
    }
});

// ============================================================================
// POST /api/upload - Upload e analisi di file video/audio
// ============================================================================

router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'Nessun file caricato'
            });
        }

        const { speakers, topic, title, language = 'it' } = req.body;

        // Validazione input
        if (!speakers) {
            return res.status(400).json({
                error: 'Campo speakers obbligatorio'
            });
        }

        let speakersArray;
        try {
            speakersArray = typeof speakers === 'string' ? JSON.parse(speakers) : speakers;
        } catch {
            return res.status(400).json({
                error: 'Campo speakers deve essere un array JSON valido'
            });
        }

        if (!Array.isArray(speakersArray) || speakersArray.length === 0) {
            return res.status(400).json({
                error: 'Speakers deve essere un array non vuoto'
            });
        }

        const analysisId = uuidv4();
        const fileId = uuidv4();
        const db = getDatabase();

        // Salva informazioni file nel database
        await db.saveUploadedFile({
            id: fileId,
            analysisId: analysisId,
            filename: req.file.filename,
            originalName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        });

        // Crea record analisi
        await db.createAnalysis({
            id: analysisId,
            title: title || `File: ${req.file.originalname}`,
            topic: topic || '',
            sourceType: 'video',
            sourceData: req.file.originalname,
            speakers: speakersArray,
            metadata: {
                file_id: fileId,
                file_size: req.file.size,
                mime_type: req.file.mimetype,
                language: language,
                processing_started: new Date().toISOString()
            }
        });

        await db.updateAnalysisStatus(analysisId, 'processing');

        // Inizia elaborazione in background
        processFileAnalysis(analysisId, req.file.path, speakersArray, topic, language)
            .catch(error => {
                console.error(`❌ Errore analisi file ${analysisId}:`, error);
                db.updateAnalysisStatus(analysisId, 'error', error.message);
            });

        res.json({
            success: true,
            analysis_id: analysisId,
            file_id: fileId,
            filename: req.file.originalname,
            file_size: req.file.size,
            status: 'processing',
            message: 'File caricato correttamente. Trascrizione e analisi in corso...'
        });

    } catch (error) {
        console.error('❌ Errore upload:', error);
        
        // Elimina file se c'è stato un errore dopo l'upload
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.warn('⚠️ Impossibile eliminare file dopo errore:', unlinkError);
            }
        }

        res.status(500).json({
            error: 'Errore durante l\'upload',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/upload/files/:fileId - Download file caricato
// ============================================================================

router.get('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const db = getDatabase();

        // Cerca il file nel database
        const file = await db.get(
            'SELECT * FROM uploaded_files WHERE id = ?',
            [fileId]
        );

        if (!file) {
            return res.status(404).json({
                error: 'File non trovato'
            });
        }

        // Verifica che il file esista fisicamente
        try {
            await fs.access(file.file_path);
        } catch {
            return res.status(404).json({
                error: 'File non trovato nel filesystem'
            });
        }

        // Imposta headers per download
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type);
        res.setHeader('Content-Length', file.file_size);

        // Stream del file
        const fileStream = require('fs').createReadStream(file.file_path);
        fileStream.pipe(res);

    } catch (error) {
        console.error('❌ Errore download file:', error);
        res.status(500).json({
            error: 'Errore durante il download',
            details: error.message
        });
    }
});

// ============================================================================
// DELETE /api/upload/files/:fileId - Elimina file caricato
// ============================================================================

router.delete('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const db = getDatabase();

        // Cerca il file nel database
        const file = await db.get(
            'SELECT * FROM uploaded_files WHERE id = ?',
            [fileId]
        );

        if (!file) {
            return res.status(404).json({
                error: 'File non trovato'
            });
        }

        // Elimina file dal filesystem
        try {
            await fs.unlink(file.file_path);
            console.log(`🗑️ File eliminato: ${file.original_name}`);
        } catch (error) {
            console.warn(`⚠️ Impossibile eliminare file ${file.file_path}:`, error);
        }

        // Elimina record dal database (questo eliminerà anche l'analisi associata)
        await db.run('DELETE FROM uploaded_files WHERE id = ?', [fileId]);

        res.json({
            success: true,
            message: 'File eliminato correttamente'
        });

    } catch (error) {
        console.error('❌ Errore eliminazione file:', error);
        res.status(500).json({
            error: 'Errore durante l\'eliminazione',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/upload/stats - Statistiche upload
// ============================================================================

router.get('/stats', async (req, res) => {
    try {
        const db = getDatabase();

        // Statistiche file
        const stats = await db.get(`
            SELECT 
                COUNT(*) as total_files,
                SUM(file_size) as total_size,
                AVG(file_size) as avg_size,
                MAX(file_size) as max_size,
                MIN(file_size) as min_size
            FROM uploaded_files
        `);

        // File per tipo MIME
        const mimeStats = await db.all(`
            SELECT mime_type, COUNT(*) as count, SUM(file_size) as total_size
            FROM uploaded_files
            GROUP BY mime_type
            ORDER BY count DESC
        `);

        // File caricati di recente
        const recentFiles = await db.all(`
            SELECT id, original_name, file_size, mime_type, uploaded_at
            FROM uploaded_files
            ORDER BY uploaded_at DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            stats: {
                ...stats,
                total_size_mb: Math.round((stats.total_size || 0) / 1024 / 1024 * 100) / 100,
                avg_size_mb: Math.round((stats.avg_size || 0) / 1024 / 1024 * 100) / 100
            },
            by_mime_type: mimeStats,
            recent_files: recentFiles
        });

    } catch (error) {
        console.error('❌ Errore statistiche upload:', error);
        res.status(500).json({
            error: 'Errore nel recupero delle statistiche',
            details: error.message
        });
    }
});

// ============================================================================
// Funzioni di Elaborazione in Background
// ============================================================================

/**
 * Elabora un file caricato (trascrizione + analisi)
 */
async function processFileAnalysis(analysisId, filePath, speakers, topic, language) {
    const db = getDatabase();

    try {
        console.log(`📁 Inizio elaborazione file: ${analysisId}`);

        // Step 1: Trascrizione
        console.log(`🎙️ Trascrizione file...`);
        const transcriptionResult = await transcriptionService.transcribeFile(filePath, language);

        if (!transcriptionResult.success || !transcriptionResult.text) {
            throw new Error('Trascrizione fallita o testo vuoto');
        }

        // Salva trascrizione
        await db.saveTranscription({
            analysisId,
            text: transcriptionResult.text,
            language: transcriptionResult.language,
            duration: transcriptionResult.duration,
            source: 'file'
        });

        // Step 2: Analisi AI
        console.log(`🤖 Analisi AI del testo trascritto...`);
        const analysis = await openRouterService.analyzeDebate(
            transcriptionResult.text, 
            speakers, 
            topic || 'Analisi file audio/video'
        );

        // Salva risultati
        await saveAnalysisResults(analysisId, analysis);

        console.log(`✅ Analisi file completata: ${analysisId}`);

    } catch (error) {
        console.error(`❌ Errore elaborazione file ${analysisId}:`, error);
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
// Middleware per gestione errori upload
// ============================================================================

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        let message = 'Errore durante l\'upload';
        
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                message = 'File troppo grande. Dimensione massima: 100MB';
                break;
            case 'LIMIT_FILE_COUNT':
                message = 'Troppi file. Carica un file alla volta';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                message = 'Campo file non riconosciuto. Usa "file"';
                break;
            default:
                message = `Errore upload: ${error.message}`;
        }

        return res.status(400).json({
            error: message,
            code: error.code
        });
    }

    // Altri errori
    if (error.message.includes('Formato file non supportato')) {
        return res.status(400).json({
            error: error.message
        });
    }

    next(error);
});

module.exports = router; 