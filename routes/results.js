// ============================================================================
// Results Routes - Gestisce la visualizzazione dei risultati delle analisi
// ============================================================================

const express = require('express');
const path = require('path');
const { getDatabase } = require('../utils/database');

const router = express.Router();

// ============================================================================
// GET /api/results/:id - Pagina risultati per un'analisi specifica
// ============================================================================

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        const analysis = await db.getAnalysis(id);

        if (!analysis) {
            return res.status(404).send(generateErrorPage('Analisi non trovata'));
        }

        const resultsHTML = generateResultsPage(analysis);
        res.send(resultsHTML);

    } catch (error) {
        console.error('❌ Errore GET /results/:id:', error);
        res.status(500).send(generateErrorPage('Errore del server'));
    }
});

// ============================================================================
// GET /api/results/:id/data - Dati JSON per i grafici
// ============================================================================

router.get('/:id/data', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        const analysis = await db.getAnalysis(id);

        if (!analysis) {
            return res.status(404).json({ error: 'Analisi non trovata' });
        }

        if (analysis.status !== 'completed') {
            return res.json({
                status: analysis.status,
                error_message: analysis.error_message
            });
        }

        const chartData = prepareChartData(analysis);

        res.json({
            success: true,
            analysis: {
                id: analysis.id,
                title: analysis.title,
                topic: analysis.topic,
                speakers: analysis.speakers,
                status: analysis.status,
                created_at: analysis.created_at,
                completed_at: analysis.completed_at
            },
            chart_data: chartData,
            comparison: analysis.comparison
        });

    } catch (error) {
        console.error('❌ Errore GET /results/:id/data:', error);
        res.status(500).json({
            error: 'Errore interno del server',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/results/:id/export - Esporta risultati in formato JSON
// ============================================================================

router.get('/:id/export', async (req, res) => {
    try {
        const { id } = req.params;
        const { format = 'json' } = req.query;
        const db = getDatabase();

        const analysis = await db.getAnalysis(id);

        if (!analysis) {
            return res.status(404).json({
                error: 'Analisi non trovata'
            });
        }

        if (analysis.status !== 'completed') {
            return res.status(400).json({
                error: 'Analisi non completata',
                status: analysis.status
            });
        }

        const exportData = {
            metadata: {
                id: analysis.id,
                title: analysis.title,
                topic: analysis.topic,
                source_type: analysis.source_type,
                speakers: analysis.speakers,
                created_at: analysis.created_at,
                completed_at: analysis.completed_at,
                exported_at: new Date().toISOString()
            },
            results: {
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
                comparison: analysis.comparison || null
            },
            transcription: analysis.transcription ? {
                text: analysis.transcription.text,
                language: analysis.transcription.language,
                duration: analysis.transcription.duration,
                source: analysis.transcription.source
            } : null
        };

        // Imposta headers per download
        const filename = `debatelens_${analysis.id}_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');

        res.json(exportData);

    } catch (error) {
        console.error('❌ Errore GET /results/:id/export:', error);
        res.status(500).json({
            error: 'Errore durante l\'esportazione',
            details: error.message
        });
    }
});

// ============================================================================
// GET /api/results - Lista risultati con filtri
// ============================================================================

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const status = req.query.status === 'completed' ? 'completed' : null;

        const db = getDatabase();
        const result = await db.getAnalysesList(page, limit, status);

        // Genera HTML per la lista risultati
        const listHTML = generateResultsListPage(result);
        res.send(listHTML);

    } catch (error) {
        console.error('❌ Errore GET /results:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Errore - DebateLens</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>❌ Errore del server</h1>
                    <p>Impossibile caricare la lista dei risultati.</p>
                    <a href="/" class="btn btn-primary">Torna alla Home</a>
                </div>
            </body>
            </html>
        `);
    }
});

// ============================================================================
// Endpoint per recuperare il testo trascritto
// ============================================================================

router.get('/:analysisId/transcript', async (req, res) => {
    try {
        const { analysisId } = req.params;
        const db = getDatabase();
        
        // Recupera la trascrizione dal database
        const transcription = await db.get(
            'SELECT * FROM transcriptions WHERE analysis_id = ?',
            [analysisId]
        );
        
        if (!transcription) {
            return res.status(404).json({
                success: false,
                error: 'Trascrizione non trovata'
            });
        }
        
        res.json({
            success: true,
            data: {
                analysisId: analysisId,
                transcript: transcription.text,
                language: transcription.language,
                duration: transcription.duration,
                createdAt: transcription.created_at,
                wordCount: transcription.text.split(' ').length
            }
        });
        
    } catch (error) {
        console.error('❌ Errore recupero trascrizione:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server'
        });
    }
});

// ============================================================================
// Funzioni di Utilità
// ============================================================================

function generateErrorPage(message) {
    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Errore - DebateLens</title>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container" style="text-align: center; padding: 4rem 0;">
        <h1>❌ ${message}</h1>
        <a href="/" class="btn btn-primary">Torna alla Home</a>
    </div>
</body>
</html>`;
}

function generateResultsPage(analysis) {
    const isCompleted = analysis.status === 'completed';
    const hasResults = isCompleted && analysis.speaker_analyses && analysis.speaker_analyses.length > 0;

    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${analysis.title} - Risultati DebateLens</title>
    <link rel="stylesheet" href="/styles.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- Librerie per PDF Export -->
    <script src="https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js"></script>
    <script src="https://unpkg.com/html2canvas@latest/dist/html2canvas.min.js"></script>
    <style>
        /* Reset specifico per pagina risultati */
        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a;
            color: #f8fafc;
            line-height: 1.6;
        }
        
        /* Main content senza header */
        .results-page {
            padding: 3rem 0;
            background: #0f172a;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 1.5rem;
        }
        
        /* Header analisi */
        .analysis-header {
            background: #1e293b;
            padding: 2rem;
            border-radius: 16px;
            margin-bottom: 2rem;
            border: 1px solid #475569;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        }
        
        .analysis-header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #f8fafc;
            background: linear-gradient(135deg, #f8fafc, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .analysis-header p {
            color: #cbd5e1;
            margin: 0.5rem 0;
        }
        
        /* Status badge */
        .status-badge {
            display: inline-block;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 600;
            text-transform: uppercase;
            margin-top: 1rem;
        }
        
        .status-completed { 
            background: #10b981; 
            color: white; 
        }
        
        .status-processing { 
            background: #06b6d4; 
            color: white; 
        }
        
        .status-error { 
            background: #ef4444; 
            color: white; 
        }
        
        /* Sezione risultati */
        .results-header {
            background: #1e293b;
            padding: 1.5rem 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            border: 1px solid #475569;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }
        
        .results-header h2 {
            font-size: 1.75rem;
            font-weight: 600;
            color: #f8fafc;
            margin: 0;
        }
        
        .export-buttons {
            display: flex;
            gap: 1rem;
        }
        
        .btn-modern {
            background: #334155;
            color: #f8fafc;
            border: 1px solid #475569;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .btn-modern:hover {
            background: #64748b;
            border-color: #2563eb;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        }
        
        /* Container grafici */
        .chart-container {
            background: #1e293b;
            padding: 2rem;
            border-radius: 16px;
            margin-bottom: 2rem;
            border: 1px solid #475569;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        }
        
        .chart-container h2 {
            font-size: 1.75rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            color: #f8fafc;
            text-align: center;
        }
        
        .radar-chart {
            max-width: 600px;
            margin: 0 auto;
        }
        
        /* Dettagli speaker */
        .speaker-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
            margin-top: 2rem;
        }
        
        .speaker-card {
            background: #1e293b;
            padding: 2rem;
            border-radius: 16px;
            border: 1px solid #475569;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            transition: all 0.2s ease;
        }
        
        .speaker-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
            border-color: #2563eb;
        }
        
        .speaker-card h3 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            color: #f8fafc;
            background: linear-gradient(135deg, #f8fafc, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        /* Griglia punteggi */
        .score-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        
        .score-item {
            background: #334155;
            padding: 1.5rem 1rem;
            border-radius: 12px;
            text-align: center;
            border: 1px solid #475569;
            transition: all 0.2s ease;
        }
        
        .score-item:hover {
            background: #475569;
            transform: translateY(-1px);
        }
        
        .score-value {
            font-size: 2rem;
            font-weight: 700;
            color: #3b82f6;
            margin-bottom: 0.5rem;
            display: block;
        }
        
        .score-item div:last-child {
            color: #cbd5e1;
            font-size: 0.875rem;
            font-weight: 500;
        }
        
        /* Stati di caricamento ed errore */
        .loading-state,
        .error-state {
            text-align: center;
            padding: 4rem 2rem;
            background: #1e293b;
            border-radius: 16px;
            border: 1px solid #475569;
            margin: 2rem 0;
        }
        
        .loading-state h2,
        .error-state h2 {
            font-size: 1.75rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        
        .loading-state h2 {
            color: #f8fafc;
        }
        
        .loading-state p {
            color: #cbd5e1;
        }
        
        .error-state {
            border-color: #ef4444;
        }
        
        .error-state h2 {
            color: #ef4444;
        }
        
        /* Loader animato */
        .loader {
            width: 40px;
            height: 40px;
            border: 4px solid #475569;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
            .analysis-header h1 {
                font-size: 2rem;
            }
            
            .results-header {
                flex-direction: column;
                text-align: center;
            }
            
            .export-buttons {
                justify-content: center;
            }
            
            .speaker-details {
                grid-template-columns: 1fr;
            }
            
            .score-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        /* Notifiche */
        .notification {
            position: fixed;
            top: 1.5rem;
            right: 1.5rem;
            z-index: 1001;
            max-width: 400px;
            background: #1e293b;
            border: 1px solid #475569;
            border-radius: 12px;
            padding: 1rem 1.5rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .notification-message {
            flex: 1;
            color: #f8fafc;
            font-weight: 500;
        }
        
        .notification-close {
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 1.25rem;
            cursor: pointer;
            padding: 0;
            transition: color 0.2s ease;
        }
        
        .notification-close:hover {
            color: #f8fafc;
        }
        
        .notification-success {
            border-left: 4px solid #10b981;
        }
        
        .notification-error {
            border-left: 4px solid #ef4444;
        }
        
        .notification-info {
            border-left: 4px solid #06b6d4;
        }
    </style>
</head>
<body>
    <div class="container results-page">
        <div class="analysis-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <div>
                    <h1>${analysis.title}</h1>
                    ${analysis.topic ? `<p style="color: var(--text-secondary); margin: 0.5rem 0;">Argomento: ${analysis.topic}</p>` : ''}
                    <p style="color: var(--text-light); margin: 0;">
                        ${analysis.speakers.join(' vs ')} • 
                        ${new Date(analysis.created_at).toLocaleDateString('it-IT')}
                    </p>
                </div>
                <span class="status-badge status-${analysis.status}">${getStatusText(analysis.status)}</span>
            </div>
        </div>

        ${generateResultsContent(analysis)}
    </div>

    <script>
        ${hasResults ? generateChartScript(analysis) : ''}
        ${analysis.status === 'processing' ? 'setTimeout(() => location.reload(), 10000);' : ''}
        
        // =============================================================================
        // Funzioni Export e Download
        // =============================================================================
        
        /**
         * Scarica la trascrizione completa
         */
        async function downloadTranscript(analysisId) {
            showNotification('📄 Scaricamento trascrizione...', 'info');
            
            try {
                const response = await fetch(\`/api/results/\${analysisId}/transcript\`);
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                const { transcript, wordCount, duration, createdAt } = result.data;
                
                // Crea il contenuto del file
                const content = \`
TRASCRIZIONE DEBATELENS
=======================

📊 Informazioni Analisi:
- ID: \${analysisId}
- Data: \${new Date(createdAt).toLocaleString('it-IT')}
- Parole: \${wordCount}
- Durata: \${duration ? Math.round(duration) + 's' : 'N/A'}

📝 TRASCRIZIONE COMPLETA:
========================

\${transcript}

---
Generato da DebateLens - https://debatelens.com
                \`.trim();
                
                // Crea e scarica il file
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`trascrizione_\${analysisId}_\${new Date().toISOString().split('T')[0]}.txt\`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('✅ Trascrizione scaricata!', 'success');
                
            } catch (error) {
                console.error('Errore download trascrizione:', error);
                showNotification('❌ Errore: ' + error.message, 'error');
            }
        }
        

        
        /**
         * Mostra notifiche
         */
        function showNotification(message, type = 'info') {
            // Rimuovi notifiche esistenti
            const existing = document.querySelectorAll('.notification');
            existing.forEach(n => n.remove());
            
            const notification = document.createElement('div');
            notification.className = \`notification notification-\${type}\`;
            notification.innerHTML = \`
                <div class="notification-content">
                    <span class="notification-icon">\${getNotificationIcon(type)}</span>
                    <span class="notification-message">\${message}</span>
                    <button class="notification-close">×</button>
                </div>
            \`;
            
            // Aggiungi event listener per il pulsante di chiusura
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    notification.remove();
                });
            }
            
            document.body.appendChild(notification);
            
            // Auto-remove dopo 5 secondi
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 5000);
        }
        
        function getNotificationIcon(type) {
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            return icons[type] || 'ℹ️';
        }



        // Funzione per scaricare la trascrizione
        async function downloadTranscript(analysisId) {
            try {
                showNotification('Sto scaricando la trascrizione...', 'info');
                
                const response = await fetch(\`/api/results/\${analysisId}/transcript\`);
                const data = await response.json();
                
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Errore nel download della trascrizione');
                }
                
                // Crea il contenuto del file
                const content = \`Trascrizione - DebateLens
ID Analisi: \${data.data.analysisId}
Data: \${new Date(data.data.createdAt).toLocaleString('it-IT')}
Durata: \${data.data.duration || 'N/A'}
Numero di parole: \${data.data.wordCount}
Lingua: \${data.data.language || 'N/A'}

========================================
TRASCRIZIONE COMPLETA
========================================

\${data.data.transcript}

========================================
Generato da DebateLens
\`;
                
                // Crea e scarica il file
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`trascrizione_\${analysisId}.txt\`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                showNotification('Trascrizione scaricata con successo!', 'success');
                
            } catch (error) {
                console.error('Errore download trascrizione:', error);
                showNotification('Errore nel download della trascrizione: ' + error.message, 'error');
            }
        }

        // Funzione per esportare PDF completo
        async function exportToPDF(analysisId) {
            try {
                showNotification('Generazione PDF completo...', 'info');
                
                // Aspetta che le librerie si carichino
                let attempts = 0;
                while ((!window.jspdf || !window.html2canvas) && attempts < 10) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                }
                
                if (!window.jspdf) {
                    throw new Error('Libreria jsPDF non disponibile. Controlla la connessione internet.');
                }
                
                if (!window.html2canvas) {
                    throw new Error('Libreria html2canvas non disponibile. Controlla la connessione internet.');
                }
                
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                
                // =============================================================================
                // PAGINA 1: INTESTAZIONE E GRAFICO RADAR
                // =============================================================================
                
                // Intestazione principale
                pdf.setFontSize(24);
                pdf.setFont('helvetica', 'bold');
                pdf.text('DebateLens - Analisi Dibattito', 20, 25);
                
                // Linea separatrice
                pdf.setLineWidth(0.5);
                pdf.line(20, 30, 190, 30);
                
                // Informazioni analisi
                pdf.setFontSize(12);
                pdf.setFont('helvetica', 'normal');
                pdf.text(\`ID Analisi: \${analysisId}\`, 20, 45);
                pdf.text(\`Data Elaborazione: \${new Date().toLocaleString('it-IT')}\`, 20, 55);
                
                // Ottieni informazioni speaker dalla pagina
                const speakerCards = document.querySelectorAll('.speaker-card');
                const speakerNames = Array.from(speakerCards).map(card => 
                    card.querySelector('h3').textContent.trim()
                );
                
                if (speakerNames.length > 0) {
                    pdf.text(\`Partecipanti: \${speakerNames.join(' vs ')}\`, 20, 65);
                }
                
                // Grafico Radar con legenda
                const radarChart = document.getElementById('radarChart');
                if (radarChart) {
                    pdf.setFontSize(16);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('Confronto Performance', 20, 85);
                    
                    // Cattura l'intero container del grafico (inclusa la legenda)
                    const chartContainer = radarChart.closest('.chart-container');
                    const chartCanvas = await html2canvas(chartContainer || radarChart, {
                        backgroundColor: '#ffffff',
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    
                    const chartImg = chartCanvas.toDataURL('image/png');
                    const chartWidth = 160;
                    const chartHeight = (chartCanvas.height * chartWidth) / chartCanvas.width;
                    
                    pdf.addImage(chartImg, 'PNG', 20, 95, chartWidth, Math.min(chartHeight, 160));
                    
                    // Aggiungi legenda manuale se non catturata
                    let legendY = 95 + Math.min(chartHeight, 160) + 10;
                    pdf.setFontSize(12);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('Legenda:', 20, legendY);
                    
                    legendY += 10;
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'normal');
                    
                    speakerNames.forEach((name, index) => {
                        const colors = ['rgb(99, 102, 241)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)'];
                        const color = colors[index % colors.length];
                        
                        // Quadratino colorato
                        const rgbMatch = color.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
                        if (rgbMatch) {
                            const [, r, g, b] = rgbMatch;
                            pdf.setFillColor(parseInt(r), parseInt(g), parseInt(b));
                            pdf.rect(20, legendY - 3, 4, 4, 'F');
                        }
                        
                        // Nome speaker
                        pdf.text(name, 30, legendY);
                        legendY += 8;
                    });
                }
                
                // =============================================================================
                // PAGINA 2+: DETTAGLI SPEAKER E PUNTEGGI
                // =============================================================================
                
                for (let i = 0; i < speakerCards.length; i++) {
                    pdf.addPage();
                    
                    const card = speakerCards[i];
                    const speakerName = card.querySelector('h3').textContent.trim();
                    
                    // Intestazione speaker
                    pdf.setFontSize(20);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(\`SPEAKER: \${speakerName}\`, 20, 25);
                    
                    // Linea separatrice
                    pdf.setLineWidth(0.5);
                    pdf.line(20, 30, 190, 30);
                    
                    // Punteggi dettagliati
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('Punteggi per Categoria', 20, 45);
                    
                    const scoreItems = card.querySelectorAll('.score-item');
                    let yPos = 60;
                    
                    scoreItems.forEach((item, index) => {
                        const scoreValue = item.querySelector('.score-value').textContent;
                        const scoreLabel = item.querySelector('div:last-child').textContent;
                        
                        // Punteggio
                        pdf.setFontSize(12);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(\`\${scoreLabel}:\`, 25, yPos);
                        
                        // Valore con colore
                        pdf.setFont('helvetica', 'normal');
                        const score = parseFloat(scoreValue);
                        let color = [0, 0, 0]; // nero default
                        
                        if (score >= 8) color = [0, 150, 0]; // verde
                        else if (score >= 6) color = [255, 165, 0]; // arancione  
                        else if (score >= 4) color = [255, 140, 0]; // arancione scuro
                        else color = [255, 0, 0]; // rosso
                        
                        pdf.setTextColor(color[0], color[1], color[2]);
                        pdf.text(\`\${scoreValue}/10\`, 100, yPos);
                        pdf.setTextColor(0, 0, 0); // reset nero
                        
                        // Barra di progresso
                        const barWidth = 60;
                        const barHeight = 4;
                        const barX = 120;
                        const barY = yPos - 3;
                        
                        // Sfondo barra
                        pdf.setFillColor(230, 230, 230);
                        pdf.rect(barX, barY, barWidth, barHeight, 'F');
                        
                        // Barra riempita
                        pdf.setFillColor(color[0], color[1], color[2]);
                        const fillWidth = (score / 10) * barWidth;
                        pdf.rect(barX, barY, fillWidth, barHeight, 'F');
                        
                        yPos += 15;
                    });
                    
                    // Valutazione generale (se presente)
                    const assessment = card.querySelector('div:last-child p');
                    if (assessment && assessment.textContent.trim()) {
                        yPos += 10;
                        pdf.setFontSize(14);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text('Valutazione Generale', 20, yPos);
                        
                        yPos += 15;
                        pdf.setFontSize(10);
                        pdf.setFont('helvetica', 'normal');
                        
                        // Dividi il testo in righe
                        const assessmentText = assessment.textContent.trim();
                        const lines = pdf.splitTextToSize(assessmentText, 170);
                        
                        lines.forEach((line, index) => {
                            if (yPos > 280) {
                                pdf.addPage();
                                yPos = 30;
                            }
                            pdf.text(line, 20, yPos);
                            yPos += 5;
                        });
                    }
                }
                
                // =============================================================================
                // ULTIMA PAGINA: RIEPILOGO E CONFRONTO
                // =============================================================================
                
                pdf.addPage();
                
                // Intestazione riepilogo
                pdf.setFontSize(20);
                pdf.setFont('helvetica', 'bold');
                pdf.text('RIEPILOGO FINALE', 20, 25);
                
                // Linea separatrice
                pdf.setLineWidth(0.5);
                pdf.line(20, 30, 190, 30);
                
                // Tabella comparativa
                pdf.setFontSize(14);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Confronto Diretto', 20, 45);
                
                // Headers tabella
                let tableY = 60;
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Categoria', 20, tableY);
                
                speakerNames.forEach((name, index) => {
                    pdf.text(name.substring(0, 15), 80 + (index * 50), tableY); // Limita lunghezza nome
                });
                
                // Linea header
                pdf.setLineWidth(0.3);
                pdf.line(20, tableY + 2, 190, tableY + 2);
                
                // Dati tabella
                const categories = ['Rigore Tecnico', 'Uso Dati', 'Stile Comunicativo', 'Focalizzazione', 'Orientamento Pratico', 'Approccio Divulgativo'];
                
                categories.forEach((category, catIndex) => {
                    tableY += 12;
                    
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(category, 20, tableY);
                    
                    speakerCards.forEach((card, speakerIndex) => {
                        const scoreItems = card.querySelectorAll('.score-item');
                        if (scoreItems[catIndex]) {
                            const score = scoreItems[catIndex].querySelector('.score-value').textContent;
                            pdf.text(score, 85 + (speakerIndex * 50), tableY);
                        }
                    });
                });
                
                // Media finale
                tableY += 20;
                pdf.setFont('helvetica', 'bold');
                pdf.text('MEDIA GENERALE:', 20, tableY);
                
                speakerCards.forEach((card, index) => {
                    const scoreItems = card.querySelectorAll('.score-item');
                    let total = 0;
                    scoreItems.forEach(item => {
                        total += parseFloat(item.querySelector('.score-value').textContent);
                    });
                    const average = (total / scoreItems.length).toFixed(1);
                    pdf.text(\`\${average}/10\`, 85 + (index * 50), tableY);
                });
                
                // Footer
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'italic');
                pdf.text('Generato da DebateLens - Analisi Intelligente dei Dibattiti', 20, 280);
                pdf.text(\`Report creato il \${new Date().toLocaleString('it-IT')}\`, 20, 285);
                
                // Salva il PDF
                const filename = \`DebateLens_Analisi_\${analysisId.substring(0, 8)}_\${new Date().toISOString().split('T')[0]}.pdf\`;
                pdf.save(filename);
                
                showNotification('PDF completo esportato con successo!', 'success');
                
            } catch (error) {
                console.error('Errore export PDF:', error);
                showNotification(\`Errore export PDF: \${error.message}\`, 'error');
            }
        }
        
        // Event listeners per i pulsanti
        document.addEventListener('DOMContentLoaded', function() {
            const downloadBtn = document.getElementById('download-transcript');
            const exportBtn = document.getElementById('export-pdf');
            
            if (downloadBtn) {
                downloadBtn.addEventListener('click', function() {
                    const analysisId = this.getAttribute('data-analysis-id');
                    downloadTranscript(analysisId);
                });
            }
            
            if (exportBtn) {
                exportBtn.addEventListener('click', function() {
                    const analysisId = this.getAttribute('data-analysis-id');
                    exportToPDF(analysisId);
                });
            }
        });
    </script>
</body>
</html>`;
}

function generateResultsContent(analysis) {
    switch (analysis.status) {
        case 'processing':
            return `
                <div class="loading-state">
                    <div class="loader" style="margin: 0 auto 1rem;"></div>
                    <h2>Analisi in corso...</h2>
                    <p>Stiamo elaborando la tua richiesta. La pagina si aggiornerà automaticamente.</p>
                </div>`;
            
        case 'error':
            return `
                <div class="error-state">
                    <h2>❌ Errore durante l'analisi</h2>
                    <p>${analysis.error_message || 'Si è verificato un errore sconosciuto.'}</p>
                    <button id="retry-btn" class="btn btn-primary" style="margin-top: 1rem;">
                        🔄 Riprova
                    </button>
                </div>`;
            
        case 'completed':
            if (!analysis.speaker_analyses || analysis.speaker_analyses.length === 0) {
                return `
                    <div class="error-state">
                        <h2>⚠️ Nessun risultato disponibile</h2>
                        <p>L'analisi è stata completata ma non sono stati generati risultati.</p>
                    </div>`;
            }
            
            return generateCompletedResults(analysis);
            
        default:
            return `
                <div class="loading-state">
                    <h2>Analisi in attesa...</h2>
                    <p>L'analisi è stata ricevuta e sarà elaborata a breve.</p>
                </div>`;
    }
}

function generateCompletedResults(analysis) {
    const speakers = analysis.speaker_analyses;
    const comparison = analysis.comparison;
    
    return `
        <!-- Sezione con pulsanti export -->
        <div class="results-header" style="background: var(--bg-card); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <h2 style="margin: 0; color: var(--text-primary);">📊 Risultati Analisi</h2>
                <div class="export-buttons">
                    <button id="download-transcript" class="btn btn-modern" data-analysis-id="${analysis.id}">
                        📄 Scarica Trascrizione
                    </button>
                    <button id="export-pdf" class="btn btn-modern" data-analysis-id="${analysis.id}">
                        📑 Esporta PDF
                    </button>
                </div>
            </div>
        </div>
        
        <div class="chart-container">
            <h2>📊 Confronto Radar</h2>
            <div class="radar-chart">
                <canvas id="radarChart" width="400" height="400"></canvas>
            </div>
        </div>

        <div class="speaker-details">
            ${speakers.map(speaker => `
                <div class="speaker-card">
                    <h3>${speaker.speaker_name}</h3>
                    
                    <div class="score-grid">
                        <div class="score-item">
                            <div class="score-value">${speaker.rigore_tecnico.toFixed(1)}</div>
                            <div>Rigore Tecnico</div>
                        </div>
                        <div class="score-item">
                            <div class="score-value">${speaker.uso_dati.toFixed(1)}</div>
                            <div>Uso Dati</div>
                        </div>
                        <div class="score-item">
                            <div class="score-value">${speaker.stile_comunicativo.toFixed(1)}</div>
                            <div>Stile Comunicativo</div>
                        </div>
                        <div class="score-item">
                            <div class="score-value">${speaker.focalizzazione.toFixed(1)}</div>
                            <div>Focalizzazione</div>
                        </div>
                        <div class="score-item">
                            <div class="score-value">${speaker.orientamento_pratico.toFixed(1)}</div>
                            <div>Orientamento Pratico</div>
                        </div>
                        <div class="score-item">
                            <div class="score-value">${speaker.approccio_divulgativo.toFixed(1)}</div>
                            <div>Approccio Divulgativo</div>
                        </div>
                    </div>

                    ${speaker.overall_assessment ? `
                        <div style="background: var(--surface); padding: 1rem; border-radius: var(--radius-md); margin: 1rem 0;">
                            <h4>Valutazione Generale</h4>
                            <p>${speaker.overall_assessment}</p>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>`;
}

function generateChartScript(analysis) {
    const chartData = prepareChartData(analysis);
    
    return `
        const ctx = document.getElementById('radarChart').getContext('2d');
        const chartData = ${JSON.stringify(chartData)};
        
        new Chart(ctx, {
            type: 'radar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Confronto delle Performance',
                        font: { size: 16, weight: 'bold' },
                        color: '#ffffff'
                    },
                    legend: {
                        position: 'bottom',
                        labels: { 
                            padding: 20, 
                            font: { size: 12 },
                            color: '#ffffff'
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 10,
                        min: 0,
                        ticks: { 
                            stepSize: 2, 
                            font: { size: 10 },
                            color: '#a0a0a0',
                            backdropColor: 'transparent'
                        },
                        pointLabels: { 
                            font: { size: 11, weight: 'bold' },
                            color: '#ffffff'
                        },
                        grid: { 
                            color: '#404040',
                            lineWidth: 1
                        },
                        angleLines: {
                            color: '#404040',
                            lineWidth: 1
                        }
                    }
                },
                elements: {
                    line: { borderWidth: 3 },
                    point: { radius: 5, hoverRadius: 8 }
                }
            }
        });`;
}

function prepareChartData(analysis) {
    const metrics = [
        'Rigore Tecnico', 'Uso Dati', 'Stile Comunicativo',
        'Focalizzazione', 'Orientamento Pratico', 'Approccio Divulgativo'
    ];

    const colors = [
        'rgba(99, 102, 241, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)', 'rgba(139, 92, 246, 0.8)', 'rgba(59, 130, 246, 0.8)'
    ];

    const datasets = analysis.speaker_analyses.map((speaker, index) => ({
        label: speaker.speaker_name,
        data: [
            speaker.rigore_tecnico, speaker.uso_dati, speaker.stile_comunicativo,
            speaker.focalizzazione, speaker.orientamento_pratico, speaker.approccio_divulgativo
        ],
        backgroundColor: colors[index % colors.length].replace('0.8', '0.2'),
        borderColor: colors[index % colors.length],
        pointBackgroundColor: colors[index % colors.length],
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: colors[index % colors.length]
    }));

    return { labels: metrics, datasets: datasets };
}

function getStatusText(status) {
    const texts = {
        'pending': 'In Attesa',
        'processing': 'In Elaborazione', 
        'completed': 'Completata',
        'error': 'Errore'
    };
    return texts[status] || status;
}

function generateResultsListPage(result) {
    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tutte le Analisi - DebateLens</title>
    <link rel="stylesheet" href="/styles.css">
    <style>
        .results-list {
            padding: 2rem 0;
        }
        
        .analysis-item {
            background: white;
            padding: 1.5rem;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border);
            margin-bottom: 1rem;
            transition: var(--transition);
        }
        
        .analysis-item:hover {
            box-shadow: var(--shadow-lg);
            transform: translateY(-2px);
        }
        
        .analysis-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        
        .pagination {
            display: flex;
            justify-content: center;
            gap: 0.5rem;
            margin-top: 2rem;
        }
        
        .pagination a, .pagination span {
            padding: 0.5rem 1rem;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            text-decoration: none;
            color: var(--text-primary);
        }
        
        .pagination .current {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="nav-brand">
                <h1 class="logo">🔍 DebateLens</h1>
            </div>
            <div class="nav-links">
                <a href="/" class="nav-link">Home</a>
                <a href="/api/results" class="nav-link">Tutti i Risultati</a>
            </div>
        </nav>
    </header>

    <div class="container results-list">
        <h1>📊 Tutte le Analisi</h1>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">
            ${result.pagination.total} analisi totali
        </p>

        ${result.analyses.length === 0 ? `
            <div style="text-align: center; padding: 4rem 2rem; background: var(--surface); border-radius: var(--radius-xl);">
                <h2>📭 Nessuna analisi trovata</h2>
                <p>Non ci sono ancora analisi completate.</p>
                <a href="/" class="btn btn-primary">Crea la Prima Analisi</a>
            </div>
        ` : `
            ${result.analyses.map(analysis => `
                <div class="analysis-item">
                    <div class="analysis-meta">
                        <div>
                            <h3 style="margin: 0 0 0.5rem 0;">
                                <a href="/api/results/${analysis.id}" style="text-decoration: none; color: var(--text-primary);">
                                    ${analysis.title}
                                </a>
                            </h3>
                            <p style="margin: 0; color: var(--text-secondary);">
                                ${analysis.speakers.join(' vs ')}
                                ${analysis.topic ? ` • ${analysis.topic}` : ''}
                            </p>
                        </div>
                        <span class="status-badge status-${analysis.status}">${getStatusText(analysis.status)}</span>
                    </div>
                    <p style="margin: 0; color: var(--text-light); font-size: var(--font-size-sm);">
                        ${new Date(analysis.created_at).toLocaleString('it-IT')}
                        ${analysis.completed_at ? ` • Completata ${new Date(analysis.completed_at).toLocaleString('it-IT')}` : ''}
                    </p>
                </div>
            `).join('')}

            <!-- Paginazione -->
            ${result.pagination.pages > 1 ? `
                <div class="pagination">
                    ${result.pagination.page > 1 ? `
                        <a href="?page=${result.pagination.page - 1}">← Precedente</a>
                    ` : ''}
                    
                    ${Array.from({length: result.pagination.pages}, (_, i) => i + 1).map(page => 
                        page === result.pagination.page ? 
                            `<span class="current">${page}</span>` :
                            `<a href="?page=${page}">${page}</a>`
                    ).join('')}
                    
                    ${result.pagination.page < result.pagination.pages ? `
                        <a href="?page=${result.pagination.page + 1}">Successiva →</a>
                    ` : ''}
                </div>
            ` : ''}
        `}
    </div>
</body>
</html>`;
}

module.exports = router; 