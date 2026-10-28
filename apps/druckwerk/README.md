# Druckwerk

Dashboard für 3D-Druck-Betriebe im Apple-Design: Drucker (auch über die Bambu Cloud), Aufträge,
Kalender, Kunden, Designdatenbank, Filamentlager, Kostenrechner und Rechnungen in einer App.

Druckwerk läuft lokal auf deinem Rechner oder einem kleinen Server im Netzwerk (Raspberry Pi,
NAS, Mac mini). Es braucht nur Node.js 18 oder neuer, keine weiteren Pakete und keine Datenbank.

## Starten

```bash
cd apps/druckwerk
node server.mjs
```

Dann <http://127.0.0.1:4321> im Browser öffnen. Beim ersten Start kannst du Beispieldaten
laden oder leer beginnen.

Im Netzwerk erreichbar machen (dann unbedingt ein Passwort setzen):

```bash
HOST=0.0.0.0 PORT=4321 DRUCKWERK_PASSWORD=dein-passwort node server.mjs
```

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `4321` | Port des Servers |
| `HOST` | `127.0.0.1` | `0.0.0.0` macht Druckwerk im ganzen Netzwerk erreichbar |
| `DATA_DIR` | `./data` | Ablage für Datenbank, hochgeladene Dateien und das Bambu-Token |
| `DRUCKWERK_PASSWORD` | leer | Schützt die App mit HTTP-Basic-Anmeldung (Benutzername beliebig) |

In Safari lässt sich Druckwerk über **Teilen › Zum Dock hinzufügen** wie eine eigene Mac-App
verwenden, auf dem iPhone und iPad über **Zum Home-Bildschirm**.

## Funktionen

| Bereich | Was er kann |
| --- | --- |
| **Dashboard** | Drucker live mit Fortschritt als Schichtstapel, Aufträge heute, Umsatz im Monat, offene Posten, nächste Aufträge, Filamentwarnungen, Umsatz der letzten 6 Monate |
| **Kalender** | Drucker-Zeitplan (Tag, 3 Tage, Woche) und Monatsansicht. Aufträge per Drag-and-drop verschieben, auch auf einen anderen Drucker. Überschneidungen werden rot markiert. Doppelklick legt einen Auftrag an |
| **Aufträge** | Kunde, Design, Menge, Drucker, Start, Dauer, Filamentspule. Werte kommen automatisch aus dem Design. „Als gedruckt melden“ bucht den Verbrauch von der Spule ab |
| **Drucker** | Von Hand anlegen oder aus der Bambu Cloud übernehmen. Leistung, Anschaffungspreis, Lebensdauer und Wartung fließen in die Kostenrechnung |
| **Filament** | Spulen mit Farbe, Material, Restmenge, Preis und Lagerort. Warnung unter einer einstellbaren Restmenge, Verbrauch buchen, Spule auffüllen |
| **Designs** | Datenbank mit Dateien (STL, 3MF, STEP …), Kategorien, Tags, Lizenz und Quelle. Für STL-Dateien erzeugt Druckwerk eine Vorschau und schätzt das Gewicht aus dem Volumen |
| **Kostenrechner** | Material (auch mehrfarbig mit AMS), Strom, Maschinenabschreibung, Wartung, Arbeitszeit, Zusatzkosten, Fehldruckrisiko, Gewinnaufschlag und Umsatzsteuer. Ergebnis pro Druck und pro Teil, Kalkulationen sichern, Preis ins Design oder in den Auftrag übernehmen |
| **Kunden** | Privat- und Firmenkunden mit Rechnungsadresse und USt-IdNr., Auftrags- und Rechnungshistorie, Umsatz |
| **Rechnungen** | Fortlaufende Nummern, Positionen aus Aufträgen übernehmen, Status (Entwurf, offen, überfällig, bezahlt), A4-Rechnung zum Drucken oder als PDF, Kleinunternehmerregelung nach § 19 UStG |
| **Einstellungen** | Firmendaten, Rechnungsnummern, Standardwerte der Kalkulation, Bambu-Cloud-Konto, Sicherung herunterladen und einspielen |

### So rechnet der Kostenrechner

Alle Werte gelten für einen Druck (eine Druckplatte):

```text
Material  = Gramm × Preis pro kg ÷ 1000 × (1 + Ausschuss %)
Strom     = Leistung (W) ÷ 1000 × Druckzeit (h) × Strompreis
Maschine  = (Anschaffung ÷ Lebensdauer (h) + Wartung pro h) × Druckzeit (h)
Arbeit    = (Vorbereitung + Nachbearbeitung) (min) ÷ 60 × Stundensatz
Risiko    = (Summe der Posten oben + Zusatzkosten) × Fehldruckrisiko %
Netto     = Selbstkosten × (1 + Gewinnaufschlag %)
```

## Bambu Cloud

**Drucker › Bambu Cloud verbinden** meldet sich mit deinem Bambu-Lab-Konto an. Bambu verlangt
dabei einen Code aus der E-Mail oder, falls eingerichtet, aus der Authenticator-App. Danach
wählst du aus, welche Drucker Druckwerk übernimmt.

- **Live-Status** per MQTT über `us.mqtt.bambulab.com` (China: `cn.mqtt.bambulab.com`):
  Fortschritt, Restzeit, Schicht, Düsen-, Bett- und Kammertemperatur, AMS-Belegung mit Farbe,
  Material und Restmenge.
- **Druckhistorie** aus der Cloud mit Gewicht und Dauer. „Kalkulieren“ übernimmt beides in den
  Kostenrechner.
- Das Passwort wird nur an Bambu Lab gesendet. Druckwerk speichert ausschließlich das
  Zugangstoken in `data/bambu.json` auf dem Server; der Browser bekommt es nie zu sehen.
- Das Token läuft nach etwa drei Monaten ab. Dann einfach erneut verbinden.

Die Bambu-Cloud-Schnittstelle ist nicht offiziell dokumentiert. Die Anbindung folgt dem, was
die Community dokumentiert hat (zum Beispiel
[coelacant1/Bambu-Lab-Cloud-API](https://github.com/coelacant1/Bambu-Lab-Cloud-API)), und kann
brechen, wenn Bambu Lab etwas ändert. Drucker ohne Cloud zeigen ihren Fortschritt anhand des
Zeitplans im Kalender.

## Daten

Alles liegt in `data/`: `db.json` (alle Datensätze), `files/` (hochgeladene Modelle und Bilder)
und `bambu.json` (Token). Der Ordner ist von Git ausgenommen. Sichere ihn regelmäßig oder nutze
**Einstellungen › Sicherung herunterladen**.

## Aufbau

```text
server.mjs          HTTP-Server: statische Dateien, REST-API, Datei-Uploads, Live-Stream (SSE)
lib/db.mjs          JSON-Datenbank mit atomarem Schreiben
lib/bambu.mjs       Bambu-Cloud-Anmeldung, Geräte, Druckhistorie, Live-Status
lib/mqtt.mjs        Minimaler MQTT-3.1.1-Client über TLS
lib/seed.mjs        Beispieldaten
public/             Oberfläche ohne Build-Schritt (HTML, CSS, JavaScript-Module)
  css/app.css       Designsystem: helle und dunkle Darstellung, Glas nur für Navigation und Sheets
  js/calc.js        Kostenformel, STL-Auswertung und Vorschau
  js/views/         Eine Datei pro Bereich
```

## Gestaltung

Die Oberfläche folgt Apples Human Interface Guidelines aus diesem Repository
(`SKILL.md`, `references/hig/`): Seitenleiste mit höchstens zwei Ebenen, die auf schmalen
Bildschirmen einklappt; Liquid Glass nur auf der schwebenden Funktionsebene (Seitenleiste,
Kopfzeile beim Scrollen, Sheets, Toasts), nie auf Inhalten; semantische Farben mit einer
Bedeutung pro Farbe (Blau interaktiv, Grün läuft oder bezahlt, Orange Achtung, Rot Fehler oder
überfällig), Status immer zusätzlich als Text; helle und dunkle Darstellung nach
Systemeinstellung; Unterstützung für „Bewegung reduzieren“, „Transparenz reduzieren“ und
„Kontrast erhöhen“; Schriftgrößen in `rem`, damit sie mit der Browsereinstellung wachsen.
