# Planyoursocials ausschließlich bei ALL‑INKL betreiben

Diese Version verwendet die bestehende Oberfläche und die bestehende SQLite-Datenbank. Auf dem Webspace läuft PHP statt des lokalen Node-Servers. Die Dateien `data/`, `uploads/` und `.env` bleiben **außerhalb** des öffentlich erreichbaren Verzeichnisses.

## Vor dem Hochladen

1. Prüfe im ALL‑INKL-KAS unter **Domain → Bearbeiten**, ob dein Tarif PHP 8.1 oder neuer (empfohlen 8.3/8.4), SSL und Cronjobs anbietet. Benötigte PHP-Erweiterungen: `pdo_sqlite`, `curl`, `openssl`, `mbstring`, `fileinfo`. Die effektiven Upload-Limits deines Tarifs müssen zu deinen Video-Dateien passen.
2. Sichere die lokale Datenbank bei gestopptem lokalen Server. Übernimm `data/socialflow.sqlite` und alle Dateien aus `uploads/`. Falls `data/.token-key` vorhanden ist, übernimm **auch diese Datei**, sonst können bestehende Instagram-Verbindungen nicht mehr entschlüsselt werden. Die vorhandene `.env` enthält Zugangsdaten: nur sicher und getrennt übertragen, nie in Git oder einen Chat hochladen. Bei laufendem SQLite-WAL zusätzlich konsistent sichern; eine einzelne Kopie der `.sqlite` während des Betriebs reicht nicht zuverlässig.
3. Auf dem Webspace einen Ordner für Planyoursocials anlegen (im Beispiel heißt er weiterhin `socialflow`) und den Projektinhalt hochladen (`index.html`, `script.js`, `styles.css`, `allinkl/`, `data/`, `uploads/`). Der lokale Node-Server, `backend/`, `server.mjs`, `package.json` und `node_modules` müssen nicht auf den Webspace.
4. `allinkl/.env.allinkl.example` als Vorlage verwenden und als `.env` im Planyoursocials-Hauptordner speichern. `PUBLIC_BASE_URL` und `INSTAGRAM_REDIRECT_URI` auf die echte HTTPS-Domain setzen. Für einen **neuen** Datenbestand `MAIN_ADMIN_NAME`, `MAIN_ADMIN_EMAIL` und `MAIN_ADMIN_PASSWORD` setzen; bei Übernahme der bestehenden Datenbank bleibt dein bisheriges Login erhalten. `NODE_ENV=production` beibehalten.
5. Im KAS als **Ziel/Webspace** der Domain den Unterordner `socialflow/allinkl/public` auswählen, nicht den Planyoursocials-Hauptordner. SSL aktivieren. So sind Datenbank, Medien und Schlüssel nicht direkt per URL erreichbar; Medien werden kontrolliert über PHP ausgeliefert.

## Zeitgesteuerte Instagram-Aufträge

Im KAS unter **Tools → Cronjobs** einen Aufruf alle 1–5 Minuten auf `https://DEINE-DOMAIN.TLD/api/cron?key=DEIN_LANGER_ZUFALLSSCHLUESSEL` einrichten. Derselbe Schlüssel steht als `CRON_SECRET` in `.env` und muss mindestens 32 Zeichen lang sein. Ohne Cronjob können Beiträge nicht zuverlässig zum geplanten Zeitpunkt veröffentlicht werden. ALL‑INKL stellt Cronjobs nicht in jedem Tarif bereit. Nur HTTPS verwenden und den Link nicht weitergeben.

## KI-Bildordner und E-Mail

Für die KI auf dem Server einen **nicht öffentlich erreichbaren** Ordner `customer-images` mit je einem Unterordner pro Kunde anlegen. Dessen absoluten Serverpfad unter `AI_IMAGE_ROOT` in `.env` eintragen. Danach zeigt die Ordnerauswahl in Planyoursocials diese Kundenordner an. Lokale Windows-, Google-Drive- oder OneDrive-Pfade sind auf dem ALL‑INKL-Server nicht unmittelbar lesbar; Bilder müssen dort hochgeladen oder separat synchronisiert werden. Die KI liest nur Bilder direkt im ausgewählten Kundenunterordner.

Für Einladungen und „Passwort vergessen“ die SMTP-Werte des E-Mail-Postfachs in `.env` eintragen. DeepL, Meta/Instagram und der KI-Agent benötigen ihre jeweiligen eigenen serverseitigen Zugangsdaten. Diese Werte niemals in `script.js` oder den öffentlichen Ordner schreiben.

## Kontrolle nach dem Hochladen

1. `https://DEINE-DOMAIN.TLD/api/health` muss `"ok":true` zeigen.
2. Anmeldung mit dem bestehenden Hauptadmin-Konto prüfen. Danach eine Kundentabelle öffnen, Text ändern und Seite neu laden.
3. Testbild hochladen, Vorschau öffnen, Kundenzugriff und Änderungsverlauf testen. Eine Testeinladung und Passwort-Zurücksetzung ausprobieren.
4. Instagram erst im **Testmodus** bzw. mit einem Testkonto prüfen. Prüfen, ob der Cronjob erreichbar ist; echte Veröffentlichung erst nach einem bewussten Freigabetest aktivieren.
5. Von `https://DEINE-DOMAIN.TLD/data/socialflow.sqlite` und `https://DEINE-DOMAIN.TLD/.env` darf **nichts** ausgeliefert werden. Wenn doch: Domain-Ziel sofort korrigieren.

Der lokale Node-Betrieb bleibt unverändert möglich (`npm start`). Die PHP-Version braucht online keinen dauerhaften Node-Prozess. Die tatsächlichen ALL‑INKL-Servergrenzen und die Meta-Freigabe lassen sich erst mit deinem konkreten Tarif und deiner Domain abschließend prüfen.
