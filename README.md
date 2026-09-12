# Leitstelle Nord · Einsatzführung

Eine lokal laufende, deutschsprachige Leitstellensimulation im Browser. Du übernimmst eine Schicht in einer integrierten Leitstelle, nimmst Notrufe auf, bewertest die Lage und disponierst Feuerwehr, Rettungsdienst, Polizei und technische Hilfe.

## Start

```bash
node server.js
```

Anschließend `http://localhost:8000` öffnen. Es gibt keine externe API, keine Datenbank und keine Abhängigkeiten; `server.js` liefert die statischen Dateien aus.

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

Die Schicht wird automatisch in `localStorage` gespeichert. „Neue Schicht“ setzt Spielstand, Queue, Einheiten und Funklog kontrolliert zurück. Ein zweiter Browser-Tab ist unabhängig und benötigt keinen Server-State.
