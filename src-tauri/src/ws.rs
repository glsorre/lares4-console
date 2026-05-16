use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use native_tls::TlsConnector as NativeTlsConnector;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::{HeaderValue, SEC_WEBSOCKET_PROTOCOL};
use tokio_tungstenite::tungstenite::protocol::{frame::coding::CloseCode, CloseFrame};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsOpts {
    #[serde(default)]
    pub accept_invalid_certs: bool,
    #[serde(default)]
    pub accept_invalid_hostnames: bool,
}

#[derive(Debug, Clone)]
enum Outgoing {
    Text(String),
    Close { code: u16, reason: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub id: u32,
    pub protocol: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum WsEvent {
    Message { data: String },
    Binary { data: String },
    Error { message: String },
    Close { code: u16, reason: String, was_clean: bool },
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static CONNECTIONS: Lazy<Mutex<HashMap<u32, mpsc::UnboundedSender<Outgoing>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn next_id() -> u32 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

fn register(id: u32, tx: mpsc::UnboundedSender<Outgoing>) {
    let mut guard = CONNECTIONS.lock().expect("CONNECTIONS poisoned");
    guard.insert(id, tx);
}

fn unregister(id: u32) {
    let mut guard = CONNECTIONS.lock().expect("CONNECTIONS poisoned");
    guard.remove(&id);
}

fn sender(id: u32) -> Option<mpsc::UnboundedSender<Outgoing>> {
    let guard = CONNECTIONS.lock().expect("CONNECTIONS poisoned");
    guard.get(&id).cloned()
}

fn emit(channel: &Channel<WsEvent>, event: WsEvent) {
    if let Err(err) = channel.send(event) {
        log::warn!("ws bridge channel send failed: {err}");
    }
}

fn build_connector(opts: &WsOpts) -> Result<Connector, String> {
    let mut builder = NativeTlsConnector::builder();
    if opts.accept_invalid_certs {
        builder.danger_accept_invalid_certs(true);
        builder.danger_accept_invalid_hostnames(true);
    } else if opts.accept_invalid_hostnames {
        builder.danger_accept_invalid_hostnames(true);
    }
    let tls = builder
        .build()
        .map_err(|err| format!("Failed to build TLS connector: {err}"))?;
    Ok(Connector::NativeTls(tls))
}

#[tauri::command]
pub async fn ws_connect(
    url: String,
    opts: Option<WsOpts>,
    protocols: Option<Vec<String>>,
    on_event: Channel<WsEvent>,
) -> Result<ConnectResult, String> {
    let opts = opts.unwrap_or_default();
    let connector = build_connector(&opts)?;

    let mut request = url
        .clone()
        .into_client_request()
        .map_err(|err| format!("Invalid WebSocket URL: {err}"))?;

    // Lares4 panels reject the upgrade unless the client advertises the `KS_WSOCK` subprotocol,
    // matching what a browser `new WebSocket(url, ["KS_WSOCK"])` would send.
    if let Some(list) = protocols.as_ref() {
        let filtered: Vec<&str> = list.iter().map(String::as_str).filter(|s| !s.is_empty()).collect();
        if !filtered.is_empty() {
            let joined = filtered.join(", ");
            let value = HeaderValue::from_str(&joined)
                .map_err(|err| format!("Invalid WebSocket subprotocol header: {err}"))?;
            request.headers_mut().insert(SEC_WEBSOCKET_PROTOCOL, value);
        }
    }

    let (ws_stream, response) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(connector),
    )
    .await
    .map_err(|err| format!("WebSocket connect failed: {err}"))?;

    let negotiated_protocol = response
        .headers()
        .get(SEC_WEBSOCKET_PROTOCOL)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned());

    let id = next_id();
    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Outgoing>();
    register(id, write_tx);

    let (mut sink, mut stream) = ws_stream.split();
    let writer_channel = on_event.clone();
    let reader_channel = on_event;

    tokio::spawn(async move {
        while let Some(msg) = write_rx.recv().await {
            match msg {
                Outgoing::Text(text) => {
                    if let Err(err) = sink.send(Message::Text(text)).await {
                        emit(
                            &writer_channel,
                            WsEvent::Error {
                                message: format!("send failed: {err}"),
                            },
                        );
                        break;
                    }
                }
                Outgoing::Close { code, reason } => {
                    let frame = CloseFrame {
                        code: CloseCode::from(code),
                        reason: reason.into(),
                    };
                    let _ = sink.send(Message::Close(Some(frame))).await;
                    break;
                }
            }
        }
        let _ = sink.close().await;
    });

    tokio::spawn(async move {
        let mut close_code: u16 = 1006;
        let mut close_reason = String::new();
        let mut was_clean = false;
        while let Some(item) = stream.next().await {
            match item {
                Ok(Message::Text(text)) => {
                    emit(&reader_channel, WsEvent::Message { data: text });
                }
                Ok(Message::Binary(bytes)) => {
                    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
                    emit(&reader_channel, WsEvent::Binary { data: encoded });
                }
                Ok(Message::Close(frame)) => {
                    if let Some(f) = frame {
                        close_code = u16::from(f.code);
                        close_reason = f.reason.to_string();
                    }
                    was_clean = true;
                    break;
                }
                Ok(_) => {}
                Err(err) => {
                    emit(
                        &reader_channel,
                        WsEvent::Error {
                            message: format!("{err}"),
                        },
                    );
                    break;
                }
            }
        }
        unregister(id);
        emit(
            &reader_channel,
            WsEvent::Close {
                code: close_code,
                reason: close_reason,
                was_clean,
            },
        );
    });

    Ok(ConnectResult {
        id,
        protocol: negotiated_protocol,
    })
}

#[tauri::command]
pub fn ws_send(id: u32, payload: String) -> Result<(), String> {
    let tx = sender(id).ok_or_else(|| format!("ws id {id} not found"))?;
    tx.send(Outgoing::Text(payload))
        .map_err(|err| format!("ws send failed: {err}"))
}

#[tauri::command]
pub fn ws_close(id: u32, code: Option<u16>, reason: Option<String>) -> Result<(), String> {
    let Some(tx) = sender(id) else { return Ok(()) };
    let _ = tx.send(Outgoing::Close {
        code: code.unwrap_or(1000),
        reason: reason.unwrap_or_default(),
    });
    Ok(())
}
