# Leitstelle Nord · Einsatzführung

Eine lokal laufende, deutschsprachige Leitstellensimulation im Browser. Du übernimmst eine Schicht in einer integrierten Leitstelle, nimmst Notrufe auf, bewertest die Lage und disponierst Feuerwehr, Rettungsdienst, Polizei und technische Hilfe.

## Implementierungsstand · Phase 3

Die aktuelle Phase ergänzt eine echte, aber bewusst begrenzte Geodaten-Grundlage für
Schleswig-Holstein (Kiel, Rendsburg, Eckernförde und weitere Orte) sowie verifizierbare
Station- und Klinik-Entitäten. `data-provider.js` kapselt Orte, Stationen, Kliniken,
Entfernungen, ETA und die Auswahl der nächstgelegenen verfügbaren Fachkomponente.
Die Standardkarte nutzt Leaflet 1.9.4 und lädt bei erreichbarem Netzwerk echte
OpenStreetMap-Straßenkacheln. Sie ist eine regionale Orientierungskarte, kein
Navigationssystem. Leaflet und die Kacheln sind optionale Online-Ressourcen: Wenn
das CDN oder OSM nicht erreichbar ist, wechselt die Oberfläche sichtbar auf die
lokale Offline-Saatkarte. Einsätze, Stationen, Kliniken und disponierte Einheiten
bleiben auch dann interaktiv; Routen werden als direkte Verbindung und mit der
lokalen ETA-Schätzung dargestellt.
`data/region.geojson` ist eine kleine, lokale Seed-Datei und wird nicht als Live-Datenquelle
behauptet.

Die aktuelle Ausbaustufe hat zusätzlich eine kleine ereignisorientierte Simulationsschicht:
Notruf, Triage, Disposition, Statuswechsel und Autosave werden als typisierte Ereignisse
veröffentlicht. Spielstände werden von `v2` nach Schema 4 migriert und bei beschädigten
Feldern defensiv bereinigt. Einheiten, Wachen und Kliniken sind echte Spielentitäten mit
Fachkomponenten, Bettenkapazität und Eignungsfilter; medizinische Einsätze können eine
geeignete Zielklinik wählen. MANV-artige Lagen (mehrere Betroffene), Gefahrgut und
Gewaltlagen erzeugen automatisch mehrere benötigte Behörden und zeigen Ressourcenlücken.
Tageszeit, Wetter und Verkehr beeinflussen die lokale ETA-Schätzung. Die Befehls-Palette
(`Ctrl+K`) ergänzt die Tastensteuerung und ist ohne Backend nutzbar.

Der Provider kann optional über `loadGeoJSON(url)` eine GeoJSON-Datei laden oder über
`configureRouting(endpoint)` einen eigenen Routing-Dienst konfigurieren. Das optionale
Endpoint erhält `?from=lat,lon&to=lat,lon` und sollte JSON mit
`routes[0].distance` (Meter) und `routes[0].duration` (Sekunden) liefern. Beide Wege sind
opt-in; ohne Konfiguration bleibt die Anwendung vollständig offline und zeigt
„Offline-Saatdaten“ sowie „Offline-Luftlinie · ETA-Schätzung“ an. Ein externer Dienst
wird in dieser Version nicht automatisch kontaktiert.

### OSM, Lizenz und Grenzen

Für eigene GeoJSON-Dateien müssen Quelle, Lizenz und Aktualisierungsdatum dokumentiert
werden. OpenStreetMap-Daten stehen unter der **ODbL**; bei abgeleiteten Daten ist eine
sichtbare Attribution „© OpenStreetMap contributors“ und der Lizenzhinweis
https://www.openstreetmap.org/copyright erforderlich. Die mitgelieferten Namen und
Koordinaten sind nur Spiel-Saatdaten, nicht für Disposition, Navigation oder
Echtbetrieb geeignet. Es gibt keine Live-Verkehrs-, Leitstellen- oder Klinikbelegung.
Die Online-Karte zeigt diese Attribution direkt im Leaflet-Kartenrand; die
Offline-Karte behauptet keine OSM-Kacheln und kennzeichnet ihre lokale Saatdatenbasis.

## Bewusst noch nicht implementiert

Die Simulation ist kein Einsatzleitsystem. Es gibt keine Live-Leitstellen-, Verkehrs-,
Wetter- oder Klinikdaten, keine echte Straßengraph-Navigation, keine Satellitenbilder und
keine automatische Vollabdeckung Deutschlands. Online-Routing und GeoJSON bleiben
konfigurierbare, explizite Opt-in-Schnittstellen. Es gibt keinen Server, kein Konto, keine
Synchronisierung und kein Multiplayer; der lokale Event-Bus ist nur eine In-App-Architektur.
Wirtschaft/Personalplanung, Replay-Export, Audio-Assets, vollständige MANV-Triage,
Fahrzeugbesatzungen und behördliche Fachdaten sind weitere Phasen. Unbekannte oder
fehlerhafte Daten fallen sichtbar auf Offline-ETA bzw. den sicheren Ausgangszustand zurück.

## Start

```bash
node server.js
```

Anschließend `http://localhost:8000` öffnen. Es gibt keine externe API, keine Datenbank und keine Abhängigkeiten; `server.js` liefert die statischen Dateien aus.

Beim ersten Öffnen erscheint das Startmenü. **Neue Schicht starten** legt einen frischen Dienst mit drei Ausgangslagen an. Diese Ausgangslagen werden für den neuen Dienst vorbereitet, zählen aber noch nicht als fortsetzbarer Spielstand; erst nach dem tatsächlichen Start der Schicht wird **Schicht fortsetzen** aktiviert. **Schicht fortsetzen** lädt danach den automatisch im Browser gespeicherten Spielstand. Spielhilfe und Einstellungen sind direkt im Menü erreichbar. Der Spielstand liegt ausschließlich in `localStorage` dieses Browsers.

## Spielablauf

- **Notrufannahme und Triage:** Neue Lagen erscheinen automatisch. Eigene Anrufe erfassen Betroffenenzahl und Gefahrenhinweise; erst nach der Erstbewertung werden sie disponierbar.
- **Einsatzqueue:** Einsätze sind nach Priorität sortiert. Die Detailansicht zeigt Empfehlung, Lageinformationen und alle freien Einheiten.
- **Disposition:** Einheiten per Checkbox auswählen und alarmieren. Jede Einheit hat einen realistischen Funkrufnamen, Standort, Fahrzeugtyp und eigene Fähigkeiten. Empfehlungen können mehrere Behörden (z. B. Rettungsdienst plus Polizei oder Feuerwehr) umfassen; fehlende Fachkomponenten werden als Ressourcenrisiko bewertet.
- **Einsatzstatus:** Lagen laufen durch `Neu/Triage → Anfahrt → vor Ort → Transport/Rückfahrt → bereit`. Rückfragen, Eskalationen, Sonderlagen und konkurrierende Ressourcen werden im Funkchronik protokolliert.
- **Führung:** Rückfragen protokollieren, Einsätze eskalieren und den Funkverkehr beobachten. Nicht versorgte Lagen steigen nach einigen Simulationsminuten automatisch in der Priorität.
- **Lagebild:** Wetter und Verkehr wechseln während der Schicht und verlängern Anfahrten. Karte und Ressourcenboard zeigen Einsatzorte, Einheiten und Verfügbarkeiten.
- **Bewertung:** Schnelle Reaktion, passende Disposition und abgeschlossene Einsätze erhöhen die Schichtbewertung; vernachlässigte oder unvollständig versorgte Notrufe kosten Punkte. Die KPI zeigt zusätzlich die mittlere Annahmezeit.

## Steuerung

| Taste | Aktion |
| --- | --- |
| `N` | Dialog für einen neuen Notruf |
| `R` | Funkverkehr fokussieren |
| `1` | Feuerwehr-Einheit zum ausgewählten Einsatz disponieren |
| `2` | Rettungsdienst disponieren |
| `3` | Polizei disponieren |
| `4` | Technische Hilfe disponieren |
| `Ctrl+K` | Befehle durchsuchen |
| `Esc` | Dialog oder Palette schließen |

Die Schicht wird automatisch in `localStorage` gespeichert. „Neue Schicht“ setzt Spielstand, Queue, Einheiten und Funklog kontrolliert zurück. Ein zweiter Browser-Tab ist unabhängig und benötigt keinen Server-State.

## Bedienung und Kompatibilität

Die Simulation läuft ohne Build-Schritt in aktuellen Desktop- und Mobilbrowsern. Der Dienst beginnt erst nach einer Auswahl im Startmenü zu laufen; dadurch kann ein pausierter Spielstand in Ruhe fortgesetzt werden. `Esc` schließt den aktiven Notruf-, Hilfe- oder Einstellungsdialog. Dialoge, Filter und die Einsatzkarte passen sich an schmale Bildschirme an. Für vollständig netzwerkfreie Nutzung muss der Browser die bereits gecachten Leaflet-Dateien besitzen; andernfalls greift die integrierte Offline-Karte ohne externe Abhängigkeiten.
