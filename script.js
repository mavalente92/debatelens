// ============================================================================
// DebateLens - Script JavaScript per la Landing Page
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Inizializza tutti i componenti della pagina
    initTabs();
    initFileUpload();
    initFormSubmission();
    initScrollEffects();
    initAnimations();
    
    console.log('🔍 DebateLens inizializzato correttamente');
}

// ============================================================================
// Gestione Tabs del Form
// ============================================================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Rimuovi classe active da tutti i bottoni e contenuti
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Aggiungi classe active al bottone cliccato e al contenuto corrispondente
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // Effetto di feedback visivo
            button.style.transform = 'scale(0.98)';
            setTimeout(() => {
                button.style.transform = 'scale(1)';
            }, 150);
        });
    });
}

// ============================================================================
// Gestione Upload File
// ============================================================================

function initFileUpload() {
    const fileInput = document.getElementById('videoFile');
    const fileUploadContent = document.querySelector('.file-upload-content');
    
    if (!fileInput || !fileUploadContent) return;
    
    // Gestione drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, unhighlight, false);
    });
    
    fileUploadContent.addEventListener('drop', handleDrop, false);
    
    // Gestione cambio file tramite input
    fileInput.addEventListener('change', handleFileSelect);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight() {
        fileUploadContent.classList.add('drag-over');
        fileUploadContent.style.borderColor = 'var(--primary)';
        fileUploadContent.style.background = 'rgba(99, 102, 241, 0.1)';
    }
    
    function unhighlight() {
        fileUploadContent.classList.remove('drag-over');
        fileUploadContent.style.borderColor = '';
        fileUploadContent.style.background = '';
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect();
        }
    }
    
    function handleFileSelect() {
        const file = fileInput.files[0];
        if (file) {
            updateFileDisplay(file);
            validateFile(file);
        }
    }
    
    function updateFileDisplay(file) {
        const fileName = file.name;
        const fileSize = formatFileSize(file.size);
        
        fileUploadContent.innerHTML = `
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p><strong>${fileName}</strong></p>
            <p class="file-info">${fileSize} - File selezionato correttamente</p>
            <p class="file-info" style="margin-top: 0.5rem;">
                <button type="button" onclick="clearFileSelection()" style="color: var(--primary); background: none; border: none; cursor: pointer; text-decoration: underline;">
                    Cambia file
                </button>
            </p>
        `;
        
        // Aggiungi animazione di successo
        fileUploadContent.style.borderColor = 'var(--accent)';
        fileUploadContent.style.background = 'rgba(16, 185, 129, 0.1)';
    }
    
    function validateFile(file) {
        const maxSize = 100 * 1024 * 1024; // 100MB
        const allowedTypes = ['video/', 'audio/'];
        
        if (file.size > maxSize) {
            showNotification('File troppo grande. Dimensione massima: 100MB', 'error');
            clearFileSelection();
            return false;
        }
        
        if (!allowedTypes.some(type => file.type.startsWith(type))) {
            showNotification('Formato file non supportato. Usa video o audio.', 'error');
            clearFileSelection();
            return false;
        }
        
        return true;
    }
}

// Funzione globale per pulire la selezione file
window.clearFileSelection = function() {
    const fileInput = document.getElementById('videoFile');
    const fileUploadContent = document.querySelector('.file-upload-content');
    
    if (fileInput) fileInput.value = '';
    
    if (fileUploadContent) {
        fileUploadContent.innerHTML = `
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <p>Trascina qui il file o clicca per selezionare</p>
            <p class="file-info">MP4, MP3, WAV fino a 100MB</p>
        `;
        fileUploadContent.style.borderColor = '';
        fileUploadContent.style.background = '';
    }
};

// ============================================================================
// Gestione Invio Form
// ============================================================================

function initFormSubmission() {
    const form = document.getElementById('analysisForm');
    
    if (!form) return;
    
    form.addEventListener('submit', handleFormSubmit);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const buttonText = submitButton.querySelector('.btn-text');
    const buttonLoader = submitButton.querySelector('.btn-loader');
    
    // Validazione form
    if (!validateForm()) {
        return;
    }
    
    // Mostra loading
    showLoading(submitButton, buttonText, buttonLoader);
    
    try {
        // Simula processamento (in una versione reale, qui faresti la chiamata API)
        await simulateAnalysis();
        
        // Mostra risultato di successo
        showSuccess();
        
    } catch (error) {
        console.error('Errore durante l\'analisi:', error);
        showNotification('Errore durante l\'analisi. Riprova più tardi.', 'error');
    } finally {
        // Nascondi loading
        hideLoading(submitButton, buttonText, buttonLoader);
    }
}

function validateForm() {
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    
    if (activeTab === 'video') {
        const videoUrl = document.getElementById('videoUrl').value.trim();
        const videoFile = document.getElementById('videoFile').files[0];
        
        if (!videoUrl && !videoFile) {
            showNotification('Inserisci un URL YouTube o carica un file video/audio', 'error');
            return false;
        }
        
        if (videoUrl && !isValidYouTubeUrl(videoUrl)) {
            showNotification('URL YouTube non valido', 'error');
            return false;
        }
        
    } else if (activeTab === 'text') {
        const textContent = document.getElementById('textContent').value.trim();
        const speakers = document.getElementById('speakers').value.trim();
        
        if (!textContent) {
            showNotification('Inserisci il testo da analizzare', 'error');
            return false;
        }
        
        if (textContent.length < 100) {
            showNotification('Il testo deve essere di almeno 100 caratteri', 'error');
            return false;
        }
        
        if (!speakers) {
            showNotification('Specifica i partecipanti al dibattito', 'error');
            return false;
        }
    }
    
    return true;
}

function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
    return youtubeRegex.test(url);
}

async function simulateAnalysis() {
    // Simula il tempo di processamento
    const steps = [
        'Caricamento contenuto...',
        'Trascrizione in corso...',
        'Analisi AI in esecuzione...',
        'Generazione grafici...',
        'Finalizzazione risultati...'
    ];
    
    for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(steps[i]);
    }
}

function showLoading(button, textElement, loaderElement) {
    button.disabled = true;
    textElement.style.display = 'none';
    loaderElement.style.display = 'flex';
    button.style.opacity = '0.8';
}

function hideLoading(button, textElement, loaderElement) {
    button.disabled = false;
    textElement.style.display = 'block';
    loaderElement.style.display = 'none';
    button.style.opacity = '1';
}

function showSuccess() {
    // In una versione reale, qui reindirizzeresti alla pagina dei risultati
    showNotification('Analisi completata con successo! In una versione completa verresti reindirizzato ai risultati.', 'success');
    
    // Scroll verso l'alto per mostrare la notifica
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// Sistema di Notifiche
// ============================================================================

function showNotification(message, type = 'info') {
    // Rimuovi notifiche esistenti
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Crea nuova notifica
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    // Aggiungi stili
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 10000;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        max-width: 400px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    notification.querySelector('.notification-content').style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.75rem;
    `;
    
    notification.querySelector('.notification-close').style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0;
        margin-left: auto;
    `;
    
    // Aggiungi al DOM
    document.body.appendChild(notification);
    
    // Animazione di entrata
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Rimozione automatica
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        success: '✓',
        error: '⚠',
        info: 'ℹ',
        warning: '⚠'
    };
    return icons[type] || icons.info;
}

function getNotificationColor(type) {
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#6366f1',
        warning: '#f59e0b'
    };
    return colors[type] || colors.info;
}

// ============================================================================
// Effetti di Scroll e Animazioni
// ============================================================================

function initScrollEffects() {
    // Effetto header al scroll
    window.addEventListener('scroll', handleHeaderScroll);
    
    // Animazioni al scroll per gli elementi
    initScrollAnimations();
}

function handleHeaderScroll() {
    const header = document.querySelector('.header');
    const scrolled = window.scrollY > 50;
    
    if (scrolled) {
        header.style.background = 'rgba(255, 255, 255, 0.98)';
        header.style.boxShadow = '0 1px 3px 0 rgb(0 0 0 / 0.1)';
    } else {
        header.style.background = 'rgba(255, 255, 255, 0.95)';
        header.style.boxShadow = 'none';
    }
}

function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Osserva gli elementi per le animazioni
    const animatedElements = document.querySelectorAll('.feature-card, .step, .analysis-form');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

function initAnimations() {
    // Animazione radar chart
    animateRadarChart();
}

function animateRadarChart() {
    const radarLine = document.querySelector('.radar-line');
    const radarDots = document.querySelectorAll('.radar-dot');
    
    if (radarLine) {
        // Animazione del poligono radar
        radarLine.style.strokeDasharray = '1000';
        radarLine.style.strokeDashoffset = '1000';
        radarLine.style.animation = 'drawRadar 2s ease forwards';
        
        // Aggiungi keyframe per l'animazione
        if (!document.querySelector('#radar-animation-styles')) {
            const style = document.createElement('style');
            style.id = 'radar-animation-styles';
            style.textContent = `
                @keyframes drawRadar {
                    to {
                        stroke-dashoffset: 0;
                    }
                }
                
                @keyframes fadeInDot {
                    from {
                        opacity: 0;
                        transform: scale(0);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Animazione dei punti
        radarDots.forEach((dot, index) => {
            dot.style.opacity = '0';
            dot.style.animation = `fadeInDot 0.5s ease forwards ${0.5 + index * 0.1}s`;
        });
    }
}

// ============================================================================
// Funzioni di Utilità
// ============================================================================

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Funzioni globali per i pulsanti
window.scrollToAnalyze = function() {
    document.getElementById('analyze').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
};

window.showDemo = function() {
    showNotification('Demo non ancora disponibile. Questa è una versione pilota del progetto!', 'info');
};

// ============================================================================
// Console welcome message
// ============================================================================

console.log(`
🔍 DebateLens - Analisi Intelligente dei Dibattiti
📚 Progetto didattico della Rizzo AI Academy
🚀 Versione: 1.0 Beta
💻 Sviluppato con HTML, CSS e JavaScript vanilla
`); 