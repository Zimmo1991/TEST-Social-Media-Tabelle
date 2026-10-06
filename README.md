# Planyoursocials

Ein lokal startbarer Prototyp für die Social-Media-Jahresplanung mehrerer Kunden.

Die Oberfläche unterstützt die aktuellen Versionen von Chrome, Edge, Firefox und Safari – auf Computer, Tablet und Smartphone. Tabellen, hochgeladene Medien und der Änderungsverlauf werden zentral im Backend gespeichert. Nach der Anmeldung steht deshalb in jedem unterstützten Browser derselbe freigegebene Stand zur Verfügung.

## Funktionen

- Gemeinsames Tabellenlayout: Spalten, Spaltenreihenfolge, Spaltenbreiten und die Zeilenhöhe der Wochenansicht werden automatisch für alle bestehenden und neuen Kundentabellen übernommen.

- Mehrere Kundentabellen anlegen und zwischen ihnen wechseln
- Echte Anmeldung mit E-Mail-Adresse und sicher gehashtem Passwort; die Tabellenoberfläche bleibt bis zur Anmeldung vollständig verborgen
- Dauerhafte Anmeldung auf dem jeweiligen Gerät, bis der Benutzer sich ausdrücklich abmeldet; die Sitzung bleibt auch nach dem Schließen des Browsers erhalten
- Sicheres Zurücksetzen vergessener Passwörter über einen einmalig nutzbaren, 30 Minuten gültigen E-Mail-Link
- Der Hauptadmin kann einen einmaligen Einladungslink für freigegebene Tabellen erstellen oder ein Kundenkonto für genau eine Kundentabelle direkt registrieren; eine freie Registrierung ist nicht möglich
- Hauptadmin bei der ersten lokalen Nutzung einmalig einrichten und Unteradmins mit eigenen Zugangsdaten anlegen
- Bestehende Kundentabellen nach zwei getrennten Sicherheitsabfragen löschen
- Neue Kundentabellen automatisch aus dem dauerhaft über seine Kennung gemerkten Schema von „Bergwerk Fitness“ erstellen
- Für jeden Unteradmin eine oder mehrere sichtbare Kundentabellen auswählen und die Freigabe später bearbeiten
- Inhalt einer Post- oder Story-Zeile mit dem Scherensymbol ausschneiden und in eine freie Zeile desselben Typs verschieben oder mit einer belegten Zeile tauschen; ein anderer Klick bricht den Vorgang ab und lässt die Quelle unverändert
- Pro Kundentabelle eigene Zusatzspalten mit frei wählbarem Titel sowie Text- oder Häkchen-Feld anlegen
- Den Planungsrhythmus je Kundentabelle zwischen einer festen Anzahl pro Woche und einer festen Anzahl pro Monat umschalten; Monatsinhalte werden gleichmäßig auf die Kalenderwochen verteilt
- Zusätzliche Beiträge und Stories pro Monat unabhängig vom gewählten Planungsrhythmus festlegen
- Durchgehende Jahresübersicht von 2026 bis einschließlich 2031 mit den korrekten 52 bzw. 53 ISO-Kalenderwochen und Monatswochen wie „Jan 1“ oder „Feb 2“
- Sichtbare Jahre pro Kundentabelle unter „Tabelle verwalten“ auswählen; ausgeblendete Jahre behalten alle gespeicherten Inhalte
- Kalenderwochen in der Jahresansicht durch eine deutlichere Trennlinie voneinander abgrenzen
- Pro Kundentabelle festlegen, ab welcher Monatswoche die Planung angezeigt wird
- Die kundenspezifischen Einstellungen über „Tabelle verwalten“ rechts oben öffnen
- Zwischen Jahresansicht und einer platzfüllenden Einzelwochenansicht wechseln
- Inhalte und hochgeladene Medien zwischen Jahres- und Wochenansicht unmittelbar synchron halten
- Bis zu 20 Bearbeitungsschritte über den eingekreisten Rückgängig-Pfeil wiederherstellen
- Änderungen sofort automatisch speichern und dem Hauptadmin die letzten 1.000 Tabellenstände im Änderungsverlauf anzeigen
- Historische Kundentabellen zunächst unverbindlich ansehen und bei Bedarf gezielt wiederherstellen
- In der Einzelwochenansicht mit Pfeilen direkt zur vorherigen oder nächsten Kalenderwoche springen
- Eine gemeinsame Zeilenhöhe in der Einzelwochenansicht manuell verändern und für alle Kalenderwochen der jeweiligen Kundentabelle speichern
- Kalenderwochen einzeln über das Augensymbol oder gesammelt über einen Von-bis-Zeitraum wie „Jan 1“ bis „Mai 4“ ausblenden und über einen jederzeit sichtbaren Zähler wiederherstellen
- Automatisch je eine Zeile pro geplantem Post und geplanter Story erzeugen; Posts stehen zuerst
- Kundenfreigabe pro Inhalt markieren
- Mehrere Bilder oder Videos pro Inhalt hinzufügen und per Klick groß ansehen
- Hochgeladene Medien aus ihrer Vorschau in einen Ordner ziehen und dort als Kopie mit dem ursprünglichen Dateinamen ablegen
- Mehrere Medien innerhalb einer Tabellenzeile per Drag-and-drop neu anordnen
- Mehrere Medien einer Zeile als randlose Vorschaubilder nebeneinander darstellen
- Medienauswahl und Medienvorschau automatisch an die vollständige Zeilenhöhe anpassen
- In der großen Vorschau mit Pfeilen durch alle hochgeladenen Medien derselben Zeile wechseln
- Hochgeladene Medien über das kleine X samt belegtem Platzhalter entfernen; die dauerhafte Fläche „Weiteres Medium“ bleibt erhalten
- Bilder und Videos direkt über „Weiteres Medium“ hochladen; die nächste freie Upload-Fläche bleibt automatisch verfügbar
- Beim Abschließen einer Zeile für jedes Bild und Video automatisch eine höchstens 2 MB große Vorschau erzeugen, das Original aus dem aktiven Speicher entfernen und es über die geschützte Archivkopie samt gespeichertem Quellpfad wiederherstellbar halten
- Spaltenbreiten innerhalb des sichtbaren Tabellenbereichs mit der Maus verändern und lokal speichern
- Spalten durch Ziehen ihrer Überschrift als Hauptadmin neu anordnen und die Reihenfolge pro Kundentabelle speichern
- Eigene Beitragstexte für Posts und Stories erfassen, jeweils mit der passenden Monatswoche im Eingabefeld
- Getrennte Spalten für den deutschen Beitragstext und den gemeinsamen Bereich „Beitragstext ita / eng“
- Deutschen Zeilentext per 🇮🇹- oder 🇬🇧-Schalter über die serverseitig geschützte DeepL-Anbindung übersetzen; beide Sprachen werden in Klickreihenfolge mit einer Leerzeile dazwischen gespeichert
- Pro Kundentabelle einen festen Hashtag-/Schlusstext hinterlegen und per Kopiersymbol zuerst den deutschen Text, danach die Übersetzung und zuletzt den festen Schlusstext übernehmen
- Änderungswünsche als freien Text pro Inhalt hinterlegen
- Änderungswünsche in einem nach unten scrollbaren Kommentar-Chat erfassen: Hauptadmin-Nachrichten erscheinen grün, zugewiesene Unteradmins erhalten innerhalb der Kundentabelle jeweils eine eigene Farbe
- Längere Kommentar-Chats pro Zeile über den kleinen Pfeil vollständig aufklappen; das Eingabefeld bleibt unten verfügbar
- Hauptadmin-geschützter KI-Vorbereitungsagent pro Kundentabelle mit exakt einem Bildordner, expliziten Websites/PDFs, Tonalität, verbotenen Begriffen und frei zuweisbaren Textfeldern
- KI-Entwurf über das kleine Sternsymbol unter „Post“ nur für die gewählte offene Post-Zeile vorbereiten; Bildauswahl, Bildanalyse und deutsche/italienische Texte mit jeweils maximal 250 Zeichen
- Bereits verwendete Kundenbilder serverseitig protokollieren und für denselben Kunden nicht erneut vorschlagen
- Status „Geplant / Veröffentlicht“ markieren
- Im Instagram-Dialog gezielt einen Kunden auswählen und pro Kundentabelle eine eigene professionelle Instagram-Seite verbinden, prüfen oder wieder trennen
- Hauptadmin-geschützte Backend-Übersicht mit Systemstatus, Instagram-Verbindungen und Veröffentlichungsaufträgen
- Bilder, Videos, Karussells, Stories und Reels als Entwurf speichern oder mit Datum und Uhrzeit einplanen
- Instagram-Format automatisch erkennen: Post-Zeilen mit Video werden zu Reels, reine Bilder zu Foto-Beiträgen oder Karussells
- Zu hohe Feed-Bilder vor dem Einplanen visuell auf das Instagram-Format 4:5 zuschneiden, ohne das Tabellenoriginal zu verändern
- Veröffentlichungen erst nach Kundenbestätigung und finaler Hauptadmin-Freigabe automatisch ausführen
- Instagram-Aufträge und Fehler serverseitig in einer lokalen SQL-Datenbank protokollieren
- Instagram-Zugriffstokens verschlüsselt statt im Browser speichern
- Zentrale Backend-Speicherung der Einstellungen, Texte, Häkchen und hochgeladenen Tabellenmedien
- Zentraler Versionsspeicher mit bis zu 1.000 Änderungen, den ausschließlich der Hauptadmin ansehen und wiederherstellen kann
- Automatische Übernahme des vorhandenen lokalen Tabellenstands beim ersten Start der neuen Backend-Speicherung
- Ansichtsmodus, gewählte Woche, Spaltenbreiten und weitere Einstellungen getrennt pro Kundentabelle speichern

## Lokal starten

Es sind keine zusätzlichen Programmpakete und kein Build-Schritt erforderlich. Benötigt wird Node.js 22.5 oder neuer.

1. Optional die Beispielkonfiguration kopieren:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Den Planyoursocials-Server starten:

   ```bash
   npm start
   ```

   Alternativ ohne npm:

   ```bash
   node --env-file-if-exists=.env server.mjs
   ```

3. [http://127.0.0.1:8765](http://127.0.0.1:8765) im Browser öffnen.

4. Beim ersten lokalen Aufruf erscheint automatisch „Hauptadmin einrichten“. Dort Namen, E-Mail-Adresse und ein Passwort mit mindestens 10 Zeichen festlegen. Danach ist die eigentliche Anwendung nur noch nach einer Anmeldung erreichbar.

Unter „Teamzugriff“ gibt es zwei Wege: Der Hauptadmin kann nach Auswahl der Tabellen ohne E-Mail-Adresse einen einmaligen, sieben Tage gültigen Einladungslink erstellen, der automatisch in die Zwischenablage kopiert wird. Wer den Link erhält, legt Name, E-Mail-Adresse und Passwort selbst fest und erhält die ausgewählten Tabellen; deshalb den Link nur an vertrauenswürdige Personen weitergeben. Alternativ kann der Hauptadmin einen Kunden mit Name, E-Mail-Adresse und Passwort direkt für genau eine Kundentabelle registrieren; die Zugangsdaten lassen sich anschließend kopieren und sicher weitergeben. Das Passwort wird nur bis zum Schließen des Dialogs angezeigt und nicht im Klartext gespeichert. Für einen öffentlich nutzbaren Einladungslink muss `PUBLIC_BASE_URL` auf die HTTPS-Adresse der App zeigen. Lokal wird ohne diese Einstellung `http://127.0.0.1:8765` verwendet. Eine freie Registrierung ohne Einladung ist nicht möglich. Ein später optional neu vergebenes Passwort beendet alle bisherigen Sitzungen dieses Kontos.

## Passwort-Zurücksetzung per E-Mail einrichten

Der Button „Passwort vergessen?“ ist bereits eingebaut. Für den echten Mailversand müssen in der nicht eingecheckten `.env`-Datei die SMTP-Daten des verwendeten E-Mail-Postfachs eingetragen werden:

```env
SMTP_HOST=mail.deine-domain.tld
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=deine-email@deine-domain.tld
SMTP_PASSWORD=dein-postfach-passwort
MAIL_FROM=Planyoursocials <deine-email@deine-domain.tld>
```

Für die online erreichbare App muss außerdem `PUBLIC_BASE_URL=https://deine-domain.tld` gesetzt sein. Der Server erzeugt daraus den Link in der E-Mail. Nach Änderungen an `.env` muss der Server neu gestartet werden. Das Postfach-Passwort bleibt ausschließlich auf dem Server und darf niemals in Git eingecheckt werden.

Die Bildordner-Auswahl des KI-Agenten kann unter Windows auch lokal synchronisierte OneDrive-Ordner und Google-Drive-Ordner beziehungsweise ein von Google Drive for Desktop eingebundenes Laufwerk auswählen. Cloud-Dateien müssen auf dem Planyoursocials-Computer tatsächlich verfügbar sein; reine Online-Platzhalter sollten vorher über „Immer auf diesem Gerät behalten“ heruntergeladen werden. Beim späteren Betrieb auf einem Webserver bezieht sich der Pfad auf das Dateisystem dieses Servers, nicht auf den Computer des Browsers.

Die Oberfläche zeigt bei einer Anfrage immer dieselbe neutrale Rückmeldung. Dadurch können Außenstehende nicht prüfen, ob eine bestimmte E-Mail-Adresse als Konto existiert. Ein neuer Zurücksetzungslink macht ältere Links ungültig; nach erfolgreicher Änderung werden alle bestehenden Anmeldungen dieses Kontos beendet.

Für eine neue Produktionsdatenbank kann der erste Hauptadmin vor dem ersten Serverstart über `MAIN_ADMIN_NAME`, `MAIN_ADMIN_EMAIL` und `MAIN_ADMIN_PASSWORD` in der nicht eingecheckten `.env`-Datei angelegt werden. Dadurch ist die öffentliche Ersteinrichtung gesperrt und niemand kann den ersten Account übernehmen. Nach der ersten erfolgreichen Anmeldung sollte `MAIN_ADMIN_PASSWORD` wieder aus der Serverkonfiguration entfernt werden; der sicher gehashte Zugang bleibt in der Datenbank erhalten.

Der Server legt die lokale SQL-Datenbank unter `data/` und alle hochgeladenen Medien unter `uploads/` ab. Beide Ordner werden nicht in Git eingecheckt. Für einen Serverumzug oder ein Backup müssen immer beide Ordner gemeinsam gesichert werden.

## Instagram zunächst sicher testen

In `.env` kann `INSTAGRAM_DRY_RUN=true` gesetzt werden. Der vollständige Planungs- und Veröffentlichungsablauf wird dann lokal ausgeführt, ohne Inhalte an Instagram zu übertragen.

## KI-Vorbereitungsagent einrichten

Der Button „KI-Agent“ ist ausschließlich für den Hauptadmin sichtbar. Trage den OpenAI-API-Schlüssel nur in der lokalen, nicht eingecheckten `.env`-Datei ein:

```env
OPENAI_API_KEY=dein-geheimer-api-schluessel
OPENAI_MODEL=gpt-4.1-mini
```

Starte Planyoursocials danach neu. Öffne oben rechts „KI-Agent“, wähle die Kundentabelle, schalte den Agenten ein und hinterlege den exakt freigegebenen Bildordner. Websites werden als vollständige Adressen und PDFs als vollständige Dateipfade jeweils zeilenweise eingetragen. In den beiden Zielfeld-Auswahlen bestimmst du, wohin der deutsche und italienische Text geschrieben wird. Werden beide Sprachen demselben Feld zugeordnet, trägt Planyoursocials zuerst Deutsch und nach einer Leerzeile Italienisch ein.

Der Agent liest nur JPG-, JPEG-, PNG- und WEBP-Dateien direkt im freigegebenen Ordner. Unterordner, symbolische Verknüpfungen und alle anderen lokalen Dateien werden serverseitig ausgeschlossen. Websites mit privaten oder lokalen Netzwerkadressen werden ebenfalls blockiert. Der API-Schlüssel bleibt im Backend und wird niemals an den Browser gesendet.

Der Agent erzeugt ausschließlich einen gespeicherten KI-Entwurf. Seine API besitzt weder eine Planungszeit noch eine Instagram-Freigabe und ruft keinen Veröffentlichungsendpunkt auf. `AI_AGENT_DRY_RUN=true` ist nur für automatische lokale Tests gedacht und darf nicht für echte Entwürfe verwendet werden.

## Echte Instagram-Verbindung vorbereiten

Für echte Veröffentlichungen werden in `.env` benötigt:

- `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET` aus „Instagram → API-Einrichtung mit Instagram-Login“ in der Meta-App. Das sind nicht die App-ID und der App-Geheimcode unter „App-Einstellungen → Allgemeines“. Die exakte `INSTAGRAM_REDIRECT_URI` muss in den Business-Login-Einstellungen als gültige OAuth-Weiterleitungs-URI eingetragen sein.
- die in Meta exakt hinterlegte `INSTAGRAM_REDIRECT_URI`
- eine öffentliche HTTPS-Adresse unter `PUBLIC_BASE_URL`, über die Meta die eingeplanten Medien abrufen kann
- ein dauerhaftes `TOKEN_ENCRYPTION_KEY` mit 32 zufälligen Base64-kodierten Bytes
- ein optionales starkes `APP_ADMIN_KEY` nur für technische Notfallzugriffe; die Oberfläche verwendet stattdessen die persönliche Hauptadmin-Anmeldung

In der Oberfläche öffnet der Hauptadmin „Instagram“, wählt dort den gewünschten Kunden aus und verbindet dessen professionelle Instagram-Seite. Im lokalen Betrieb können App-ID und App-Secret dort einmalig eingegeben werden: Das Backend trägt sie in `.env` ein und übernimmt sie sofort. Das App-Secret wird anschließend weder angezeigt noch an den Browser zurückgegeben. Online ist diese Eingabemöglichkeit aus Sicherheitsgründen gesperrt; dort werden die Werte in der geschützten Serverkonfiguration des Hosting-Anbieters hinterlegt.

Pro Kundentabelle kann außerdem ein Instagram-Benutzername oder eine Profil-URL als Zuordnung gespeichert und über „Suchen / öffnen“ aufgerufen werden. Diese Profilangabe ersetzt keine Verbindung: Die tatsächliche Freigabe erfolgt immer über „Instagram-Seite verbinden“ und den offiziellen Meta-Login. Jede Verbindung wird getrennt unter der Kennung der jeweiligen Kundentabelle gespeichert; das Wechseln, Verbinden oder Trennen eines Kunden verändert die Verbindungen der anderen Kunden nicht.

Für Kundenkonten außerhalb der eigenen Meta-App-Testrollen ist bei Meta „Advanced Access“ beziehungsweise eine App-Prüfung erforderlich.

## Hinweis zum Prototyp

Benutzerkonten, Passwort-Hashes, Sitzungen, Instagram-Verbindungen, Veröffentlichungsaufträge, hochgeladene Auftragsmedien und Protokolle werden im Backend gespeichert. Passwörter werden nicht im Klartext gespeichert; Sitzungen verwenden ein `HttpOnly`-Cookie, das im Produktionsbetrieb nur über HTTPS übertragen wird. Nach fünf fehlgeschlagenen Anmeldeversuchen wird die betreffende Kombination aus Adresse und E-Mail für 15 Minuten gebremst.

Kundentabellen, Tabellenmedien und Änderungsverlauf liegen zentral im Backend. Der Browser hält lediglich eine lokale Sicherheitskopie für den laufenden Arbeitsplatz; maßgeblich ist nach der Anmeldung der Serverstand. Unteradmins erhalten serverseitig ausschließlich die ihnen zugewiesenen Kundentabellen. Für einen öffentlichen Betrieb müssen `data/` und `uploads/` auf dauerhaftem Serverspeicher liegen und regelmäßig gemeinsam gesichert werden.

# Betrieb ausschließlich bei ALL‑INKL

Die PHP-Version für ALL‑INKL mit denselben Oberflächen- und Datenbankdateien ist unter [allinkl/README.md](allinkl/README.md) beschrieben. Der lokale Node-Start bleibt weiterhin möglich.

Für die lokale PHP-Ansicht startet `.\start-backend.ps1` den Server auf `http://127.0.0.1:8765/` mit den benötigten Erweiterungen und einem Upload-Limit von 250 MB. Das PowerShell-Fenster während der Arbeit geöffnet lassen. Wenn Port 8765 bereits belegt ist, zuerst den bisherigen lokalen Server beenden.
