# Gestionale Liste Tavoli — frontend web

Apri il gestionale: **https://abelaanto-commits.github.io/liste-tavoli-web/**

Questo repository contiene esclusivamente la **parte frontend statica** dell'applicazione. Il database, le password degli utenti, gli invitati e gli ingressi sono conservati in **Supabase**, protetti con autenticazione e politiche di accesso ai dati (RLS).

- **Amministratore:** crea eventi, utenti e liste, imposta scadenze, genera e salva PDF.
- **Capogruppo:** gestisce soltanto i propri tavoli e nominativi prima della scadenza.
- **Addetto liste:** fino a tre account; registra gli ingressi, con blocco dei duplicati all'interno dello stesso tavolo.
- **PDF:** A4 su tre colonne, tavoli ordinati A–Z e persone ordinate per nome, poi cognome.

Il repository applicativo principale resta privato. Non inserire mai credenziali, password, dati di invitati o chiavi segrete in questo repository pubblico.

**Funzioni ancora da completare:** PDF automatico all'orario di chiusura, invio PDF tramite email e test finale con account reali.
