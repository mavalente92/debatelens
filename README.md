# 🔍 DebateLens

**Analisi Intelligente dei Dibattiti con AI**

Una webapp moderna e minimale per analizzare e confrontare il modo in cui due o più soggetti si esprimono durante dibattiti politici, scientifici, divulgativi o mediatici.

![DebateLens Banner](https://via.placeholder.com/800x400/6366f1/ffffff?text=DebateLens+AI+Analysis)

## 📋 Panoramica del Progetto

DebateLens è un progetto didattico nato all'interno della **Rizzo AI Academy** per creare una soluzione che utilizza modelli linguistici avanzati per:

- **Analizzare** video e testi di dibattiti
- **Confrontare** stili comunicativi e approcci argomentativi
- **Visualizzare** i risultati attraverso grafici radar interattivi
- **Valutare** rigore tecnico, uso di dati, focalizzazione e orientamento pratico

## ✨ Caratteristiche Principali

### 🎥 **Analisi Multi-formato**
- **Video YouTube**: Inserisci un URL e analizza automaticamente
- **File Audio/Video**: Carica file locali (MP4, MP3, WAV)
- **Testo Diretto**: Incolla trascrizioni o articoli da analizzare

### 🤖 **AI Avanzata**
- Trascrizione automatica con tecnologie speech-to-text
- Analisi semantica approfondita con modelli linguistici
- Metriche personalizzate per diverse tipologie di dibattito

### 📊 **Visualizzazione Moderna**
- Grafici radar per confronti visivi immediati
- Interface responsive e accessibile
- Design minimale e user-friendly

### ⚡ **Performance Ottimizzate**
- Caricamento rapido con vanilla JavaScript
- CSS moderno con variabili custom
- Supporto per dark mode automatico

## 🚀 Come Iniziare

### Requisiti
- Browser moderno (Chrome, Firefox, Safari, Edge)
- Connessione internet per i font e eventuali API

### Installazione Locale

1. **Clona il repository**
```bash
git clone https://github.com/TUO-USERNAME/DebateLens.git
cd DebateLens
```

2. **Apri il progetto**
```bash
# Apri direttamente index.html nel browser
open index.html

# Oppure usa un server locale (raccomandato)
python -m http.server 8000
# Poi vai su http://localhost:8000
```

3. **Inizia ad analizzare!**
   - Apri la webapp nel browser
   - Scegli tra analisi video o testo
   - Carica il contenuto da analizzare
   - Visualizza i risultati

## 📁 Struttura del Progetto

```
DebateLens/
├── index.html          # Pagina principale
├── styles.css          # Stili CSS moderni
├── script.js           # Logica JavaScript
├── README.md           # Documentazione
└── assets/             # (futuro) Immagini e risorse
    ├── images/
    └── icons/
```

## 🎨 Design System

### Colori
- **Primary**: `#6366f1` (Indaco moderno)
- **Secondary**: `#f1f5f9` (Grigio chiaro)
- **Accent**: `#10b981` (Verde successo)
- **Background**: `#ffffff` (Bianco pulito)

### Tipografia
- **Font**: Inter (Google Fonts)
- **Pesi**: 300, 400, 500, 600, 700
- **Scale**: Sistema armonico basato su rem

### Componenti
- **Buttons**: Stati hover con transform e shadow
- **Forms**: Focus states con border colorati
- **Cards**: Shadow soft con hover effects
- **Animations**: Transizioni smooth con cubic-bezier

## 🔧 Funzionalità Tecniche

### HTML Semantico
- Struttura accessibile con ARIA labels
- Meta tags per SEO e social sharing
- Markup pulito e validato

### CSS Moderno
- Custom Properties (CSS Variables)
- CSS Grid e Flexbox per layout
- Media queries per responsività
- Supporto dark mode con `prefers-color-scheme`

### JavaScript Vanilla
- Event delegation per performance
- Intersection Observer per animazioni scroll
- File API per drag & drop
- Promise-based per operazioni async

## 📱 Responsività

Il design è completamente responsive e ottimizzato per:
- **Desktop**: Layout a due colonne, navigazione orizzontale
- **Tablet**: Layout adattivo con componenti ridimensionati
- **Mobile**: Single column, navigazione verticale, touch-friendly

## 🎯 Metriche di Analisi

DebateLens valuta i partecipanti secondo queste dimensioni:

1. **Rigore Tecnico** - Precisione e accuratezza delle informazioni
2. **Uso di Dati** - Quantità e qualità di dati oggettivi citati
3. **Stile Comunicativo** - Chiarezza e efficacia della comunicazione
4. **Focalizzazione** - Aderenza al topic e struttura argomentativa
5. **Orientamento Pratico** - Applicabilità e concretezza delle proposte
6. **Approccio Divulgativo** - Capacità di rendere accessibili concetti complessi

## 🔮 Roadmap Futura

### Fase 1 - MVP ✅
- [x] Landing page funzionale
- [x] Form di upload
- [x] Design responsive
- [x] Validazione client-side

### Fase 2 - Backend Integration
- [ ] API per trascrizione video
- [ ] Integrazione modelli AI (GPT-4, Gemini)
- [ ] Database per storing risultati
- [ ] Sistema di autenticazione

### Fase 3 - Funzionalità Avanzate
- [ ] Grafici radar interattivi con Chart.js
- [ ] Export risultati in PDF
- [ ] Confronti storici
- [ ] Dashboard analytics

### Fase 4 - Scalabilità
- [ ] Deployment su Railway/Vercel
- [ ] CDN per assets
- [ ] Monitoring e analytics
- [ ] API pubblica

## 🤝 Contribuire

Questo è un progetto didattico aperto alla collaborazione!

### Come Contribuire
1. **Fork** il repository
2. **Crea** un branch per la tua feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** le tue modifiche (`git commit -m 'Add some AmazingFeature'`)
4. **Push** al branch (`git push origin feature/AmazingFeature`)
5. **Apri** una Pull Request

### Aree di Contribuzione
- 🎨 **Design**: Miglioramenti UI/UX
- 💻 **Frontend**: Nuove funzionalità JavaScript
- 🔧 **Backend**: Integrazione API e database
- 📝 **Documentazione**: Guide e tutorial
- 🧪 **Testing**: Unit e integration tests

## 📄 Licenza

Questo progetto è rilasciato sotto licenza **MIT**.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

## 👥 Team

**Rizzo AI Academy**
- 🎓 Progetto didattico per apprendimento full-stack
- 🤖 Focus su AI e tecnologie moderne
- 🌐 Community di sviluppatori in crescita

## 📞 Contatti

- **GitHub**: [Rizzo-AI-Academy/DebateLens](https://github.com/Rizzo-AI-Academy/DebateLens)
- **Website**: [DebateLens.app](https://debatelens.app) _(coming soon)_
- **Community**: Rizzo AI Academy Discord

---

<div align="center">

**Made with ❤️ by Rizzo AI Academy**

[⭐ Star questo repo](https://github.com/Rizzo-AI-Academy/DebateLens) se ti è utile!

</div> 