# Leitstelle Nord · Einsatzführung

Eine lokal laufende, deutschsprachige Leitstellensimulation im Browser. Du übernimmst eine Schicht in einer integrierten Leitstelle, nimmst Notrufe auf, bewertest die Lage und disponierst Feuerwehr, Rettungsdienst, Polizei und technische Hilfe.

## Start

```bash
node server.js
```

Anschließend `http://localhost:8000` öffnen. Es gibt keine externe API, keine Datenbank und keine Abhängigkeiten; `server.js` liefert die statischen Dateien aus.

## Spielablauf

- **Notrufe:** Neue Lagen erscheinen automatisch. Über „Eingehenden Notruf erfassen“ können eigene Anrufe mit Stichwort, Priorität, Ort und Lagebeschreibung aufgenommen werden.
- **Einsatzqueue:** Einsätze sind nach Priorität sortiert. Die Detailansicht zeigt Empfehlung, Lageinformationen und alle freien Einheiten.
- **Disposition:** Einheiten per Checkbox auswählen und alarmieren. Die Simulation führt sie durch `Anfahrt → vor Ort → Transport/Rückfahrt → bereit`. Medizinische P1/P2-Einsätze lösen standardmäßig einen Kliniktransport aus.
- **Führung:** Rückfragen protokollieren, Einsätze eskalieren und den Funkverkehr beobachten. Nicht versorgte Lagen steigen nach einigen Simulationsminuten automatisch in der Priorität.
- **Lagebild:** Wetter und Verkehr wechseln während der Schicht und verlängern Anfahrten. Karte und Ressourcenboard zeigen Einsatzorte, Einheiten und Verfügbarkeiten.
- **Bewertung:** Schnelle Reaktion, passende Disposition und abgeschlossene Einsätze erhöhen die Schichtbewertung; vernachlässigte Notrufe kosten Punkte.

## Steuerung

| Taste | Aktion |
| --- | --- |
| `N` | Dialog für einen neuen Notruf |
| `R` | Funkverkehr fokussieren |
| `1` | Feuerwehr-Einheit zum ausgewählten Einsatz disponieren |
| `2` | Rettungsdienst disponieren |
| `3` | Polizei disponieren |
| `4` | Technische Hilfe disponieren |

Die Schicht wird automatisch in `localStorage` gespeichert. „Neue Schicht“ setzt Spielstand, Queue, Einheiten und Funklog kontrolliert zurück. Ein zweiter Browser-Tab ist unabhängig und benötigt keinen Server-State.
