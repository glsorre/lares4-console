# lares4 console

Console di debug standalone per centrali Lares4, sviluppata con Ink e basata su `lares4-ts`.

## Utilizzo

### Opzione 1: Avvio con variabili d’ambiente (non interattivo)

Imposta le variabili d’ambiente obbligatorie:

- `LARES4_IP`
- `LARES4_PIN`

Opzionali:

- `LARES4_SENDER` (predefinito: `lares4 console`)
- `LARES4_WSS` (`false` per usare ws, predefinito wss)

Poi esegui:

```bash
npm run dev
```

### Opzione 2: Avvio senza variabili obbligatorie (finestra introduttiva interattiva)

Se all’avvio manca `LARES4_IP` o `LARES4_PIN`, l’app apre una finestra introduttiva e richiede:

- `ip`
- `pin`
- `wss` (attivo/disattivo)

I valori inseriti nella finestra introduttiva valgono solo per l’esecuzione corrente e non vengono salvati.

Puoi navigare con `Tab` / `Shift+Tab` oppure le frecce e premere `Invio` per proseguire.

## Esempio rapido

```bash
LARES4_IP=192.168.1.40 LARES4_PIN=123456 npm run dev
```
