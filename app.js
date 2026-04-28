// IVAI Coach – app.js v2.0
// Ljudinspelning (MediaRecorder) + transkript + AI-svar
// IndexedDB (inkl. ljudblob) + export som filer

// ════════════════════════════════════════════════════════
//  INDEXEDDB
// ════════════════════════════════════════════════════════
const DB_NAME    = "ivai_v2";
const DB_VERSION = 2;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("sessions")) {
        const s = d.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("startedAt", "startedAt");
      }
      if (!d.objectStoreNames.contains("audio")) {
        d.createObjectStore("audio", { keyPath: "id" });
      }
    };
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror   = () => rej(req.error);
  });
}

async function dbGet(store, id) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const req = d.transaction(store,"readonly").objectStore(store).get(id);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function dbAll(store) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const req = d.transaction(store,"readonly").objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}
async function dbPut(store, item) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const req = d.transaction(store,"readwrite").objectStore(store).put(item);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function dbDelete(store, id) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const req = d.transaction(store,"readwrite").objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}
async function dbClear(store) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const req = d.transaction(store,"readwrite").objectStore(store).clear();
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ════════════════════════════════════════════════════════
//  AI-FÖRSLAG
// ════════════════════════════════════════════════════════
async function fetchSuggestions(text) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Du är en tyst intervjucoach. Användaren är i en jobbintervju just nu.
Ge exakt 3 korta, konkreta svarförslag på svenska baserade på vad intervjuaren just sa.
Varje förslag ska vara max 1–2 meningar. Formatera ENBART som JSON-array utan preamble:
["förslag 1","förslag 2","förslag 3"]`,
      messages: [{ role:"user", content:`Intervjuaren sa: "${text}"` }]
    })
  });
  const data = await res.json();
  const raw = data.content?.find(b => b.type==="text")?.text || "[]";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

// ════════════════════════════════════════════════════════
//  EXPORT HELPERS
// ════════════════════════════════════════════════════════
async function exportSession(session) {
  const meta = [
    "IVAI Coach – Sessionsexport",
    `Datum: ${new Date(session.startedAt).toLocaleString("sv-SE")}`,
    `Varaktighet: ${fmt(session.duration * 1000)}`,
    `Transkriptrader: ${session.transcript.length}`,
    "",
    "══ TRANSKRIPT ══",
    ...session.transcript.map(l => `[${l.ts}] ${l.text}`),
    "",
    "══ AI-FÖRSLAG (sista) ══",
    ...(session.suggestions || []).map((s,i) => `${i+1}. ${s}`)
  ].join("\n");

  dlBlob(
    new Blob([meta], { type:"text/plain;charset=utf-8" }),
    `ivai_${session.id}_transkript.txt`
  );

  const audioRec = await dbGet("audio", session.id);
  if (audioRec?.blob) {
    const ext = audioRec.mimeType?.includes("ogg") ? "ogg"
              : audioRec.mimeType?.includes("mp4") ? "m4a" : "webm";
    dlBlob(audioRec.blob, `ivai_${session.id}_ljud.${ext}`);
  }
}

function dlBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════
function fmt(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60);
  return `${String(m).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleString("sv-SE",{dateStyle:"medium",timeStyle:"short"});
}
function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

// ════════════════════════════════════════════════════════
//  CSS
// ════════════════════════════════════════════════════════
const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Rajdhani:wght@400;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --bg:#080c0f;--surface:#0d1417;--surface2:#121a1e;
    --border:#1a2a2f;--accent:#00ffb2;--accent2:#00c8ff;
    --adim:rgba(0,255,178,.10);--text:#d4e8e0;--dim:#4a7060;
    --danger:#ff4466;--warn:#ffb800;
    --mono:'IBM Plex Mono',monospace;--disp:'Rajdhani',sans-serif;
    --sit:env(safe-area-inset-top,0px);--sib:env(safe-area-inset-bottom,0px);
  }
  html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--mono)}

  .app{
    height:100vh;height:-webkit-fill-available;
    display:flex;flex-direction:column;overflow:hidden;
    padding-top:var(--sit);padding-bottom:var(--sib);background:var(--bg);
  }
  .scanline{
    position:fixed;inset:0;pointer-events:none;z-index:100;
    background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,178,.012) 2px,rgba(0,255,178,.012) 4px);
  }

  /* HEADER */
  .hdr{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border);background:rgba(13,20,23,.98);flex-shrink:0;gap:8px}
  .logo{font-family:var(--disp);font-size:19px;font-weight:700;letter-spacing:3px;color:var(--accent);text-shadow:0 0 14px rgba(0,255,178,.35);white-space:nowrap}
  .logo span{color:var(--dim);font-weight:400}
  .nav{display:flex;gap:6px;flex-wrap:wrap}
  .nb{font-family:var(--mono);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:5px 10px;background:transparent;border:1px solid var(--border);color:var(--dim);cursor:pointer;transition:all .2s;white-space:nowrap}
  .nb:hover,.nb.on{border-color:var(--accent);color:var(--accent);background:var(--adim)}

  /* STATUS */
  .sbar{display:flex;align-items:center;gap:14px;padding:5px 14px;background:var(--surface);border-bottom:1px solid var(--border);font-size:9px;letter-spacing:1.5px;color:var(--dim);text-transform:uppercase;flex-shrink:0;overflow-x:auto}
  .sbar::-webkit-scrollbar{display:none}
  .si{display:flex;align-items:center;gap:5px;white-space:nowrap}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--dim);flex-shrink:0}
  .dot.on{background:var(--accent);box-shadow:0 0 6px var(--accent);animation:pulse 1.4s ease-in-out infinite}
  .dot.rec{background:var(--danger);box-shadow:0 0 6px var(--danger);animation:pulse .8s ease-in-out infinite}
  .dot.ok{background:var(--accent);box-shadow:0 0 5px var(--accent)}
  .dot.warn{background:var(--warn);box-shadow:0 0 5px var(--warn)}
  .dot.err{background:var(--danger);box-shadow:0 0 5px var(--danger)}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}

  .offbanner{background:rgba(255,184,0,.12);border-bottom:1px solid var(--warn);padding:5px 14px;font-size:9px;letter-spacing:2px;color:var(--warn);text-transform:uppercase;text-align:center;flex-shrink:0}

  /* MAIN */
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
  @media(min-width:680px){.main{flex-direction:row}}

  /* PANELS */
  .panel{display:flex;flex-direction:column;overflow:hidden;flex:1;border-bottom:1px solid var(--border);min-height:0}
  @media(min-width:680px){.panel{border-bottom:none;border-right:1px solid var(--border)}.panel:last-child{border-right:none}}
  .ph{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--border);background:var(--surface2);flex-shrink:0}
  .pt{font-family:var(--disp);font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--dim)}
  .pt.on{color:var(--accent)}
  .pb{flex:1;overflow-y:auto;padding:14px;min-height:0}
  .pb::-webkit-scrollbar{width:2px}
  .pb::-webkit-scrollbar-thumb{background:var(--border)}

  /* TRANSCRIPT */
  .tl{font-size:11px;line-height:1.8;color:var(--text);margin-bottom:3px;padding:5px 8px;border-left:2px solid transparent;transition:all .3s}
  .tl.new{border-left-color:var(--accent);background:var(--adim);color:#fff}
  .tl .ts{font-size:8px;color:var(--dim);margin-right:7px}
  .intr{font-size:11px;color:var(--dim);font-style:italic;padding:5px 8px;border-left:2px solid var(--dim);animation:bb 1s ease-in-out infinite}
  @keyframes bb{0%,100%{border-left-color:var(--dim)}50%{border-left-color:transparent}}

  /* SUGGESTION CARDS */
  .sc{background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent);padding:11px 13px;margin-bottom:8px;cursor:pointer;transition:all .2s;animation:slin .25s ease-out both}
  .sc:nth-child(2){border-left-color:var(--accent2);animation-delay:.05s}
  .sc:nth-child(3){border-left-color:var(--warn);animation-delay:.1s}
  .sc:hover{border-color:var(--accent);background:rgba(0,255,178,.05)}
  @keyframes slin{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
  .cn{font-size:8px;letter-spacing:2px;color:var(--dim);margin-bottom:4px;text-transform:uppercase}
  .ct{font-size:12px;line-height:1.6;color:var(--text)}
  .ch{font-size:8px;color:var(--dim);margin-top:5px;letter-spacing:1px}

  /* LOADING */
  .ld{display:flex;gap:5px;align-items:center;padding:14px;color:var(--dim);font-size:10px;letter-spacing:2px}
  .dd{width:4px;height:4px;border-radius:50%;background:var(--accent);animation:bn 1.2s ease-in-out infinite}
  .dd:nth-child(2){animation-delay:.2s}.dd:nth-child(3){animation-delay:.4s}
  @keyframes bn{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}

  /* EMPTY */
  .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--dim);font-size:10px;letter-spacing:1px;text-align:center}
  .ei{font-size:26px;opacity:.25}

  /* CONTROLS */
  .ctrl{padding:11px 14px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;background:var(--surface);flex-shrink:0;flex-wrap:wrap}
  .bm{font-family:var(--disp);font-size:12px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;padding:9px 18px;border:none;cursor:pointer;transition:all .2s}
  .bstart{background:var(--accent);color:#000}.bstart:hover{box-shadow:0 0 14px rgba(0,255,178,.4)}
  .bstop{background:var(--danger);color:#fff}.bstop:hover{box-shadow:0 0 14px rgba(255,68,102,.4)}
  .bg{font-family:var(--mono);font-size:9px;letter-spacing:1px;padding:9px 11px;background:transparent;border:1px solid var(--border);color:var(--dim);cursor:pointer;transition:all .2s;white-space:nowrap}
  .bg:hover{border-color:var(--accent);color:var(--accent)}
  .timer{font-size:11px;letter-spacing:2px;color:var(--dim);margin-left:auto}
  .timer.on{color:var(--danger)}
  .rec-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;color:var(--danger);letter-spacing:2px;text-transform:uppercase}

  /* AUDIO PLAYER */
  .awrap{background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent2);padding:12px 14px;margin-bottom:10px}
  .albl{font-size:9px;letter-spacing:2px;color:var(--accent2);margin-bottom:8px;text-transform:uppercase}
  .awrap audio{width:100%;height:36px;filter:invert(1) hue-rotate(150deg) saturate(.6);opacity:.85}
  .ameta{font-size:9px;color:var(--dim);margin-top:6px;letter-spacing:1px;display:flex;gap:12px}

  /* HISTORY */
  .sv{flex:1;overflow-y:auto;padding:14px}
  .sv::-webkit-scrollbar{width:2px}
  .sv::-webkit-scrollbar-thumb{background:var(--border)}
  .htitle{font-family:var(--disp);font-size:15px;font-weight:700;letter-spacing:3px;color:var(--accent);text-transform:uppercase;margin-bottom:14px}
  .hhdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .scard{background:var(--surface);border:1px solid var(--border);padding:12px 14px;margin-bottom:7px;cursor:pointer;transition:all .2s;display:flex;align-items:flex-start;gap:10px}
  .scard:hover{border-color:var(--accent);background:var(--surface2)}
  .sinfo{flex:1;min-width:0}
  .sdate{font-size:10px;color:var(--accent);letter-spacing:1px;margin-bottom:3px}
  .sprev{font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .smeta{font-size:9px;color:var(--dim);text-align:right;flex-shrink:0;line-height:1.7}
  .sbadge{font-size:8px;letter-spacing:1px;text-transform:uppercase;margin-top:3px;color:var(--accent2)}
  .bdel{background:transparent;border:1px solid var(--border);color:var(--danger);font-size:9px;padding:5px 7px;cursor:pointer;font-family:var(--mono);transition:all .2s;flex-shrink:0}
  .bdel:hover{border-color:var(--danger);background:rgba(255,68,102,.1)}

  /* DETAIL */
  .back{font-size:9px;letter-spacing:2px;color:var(--dim);cursor:pointer;text-transform:uppercase;margin-bottom:14px;display:inline-flex;align-items:center;gap:5px;transition:color .2s}
  .back:hover{color:var(--accent)}
  .dsec{margin-bottom:22px}
  .dlbl{font-size:9px;letter-spacing:2px;color:var(--dim);text-transform:uppercase;margin-bottom:9px;padding-bottom:5px;border-bottom:1px solid var(--border)}
  .exp-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .bexp{font-family:var(--mono);font-size:9px;letter-spacing:1px;padding:8px 12px;background:transparent;border:1px solid var(--accent2);color:var(--accent2);cursor:pointer;transition:all .2s;white-space:nowrap}
  .bexp:hover{background:rgba(0,200,255,.1)}

  /* TOAST */
  .toast{position:fixed;bottom:calc(20px + var(--sib));left:50%;transform:translateX(-50%);background:var(--accent);color:#000;font-size:10px;letter-spacing:2px;padding:8px 16px;font-family:var(--disp);font-weight:600;z-index:999;text-transform:uppercase;animation:tin .25s ease-out both,tout .25s 1.75s ease-in both;white-space:nowrap}
  @keyframes tin{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
  @keyframes tout{to{opacity:0;transform:translate(-50%,8px)}}
`;

// ════════════════════════════════════════════════════════
//  REACT APP
// ════════════════════════════════════════════════════════
const { useState, useEffect, useRef, useCallback } = React;

function App() {
  const [view,          setView]          = useState("live");
  const [isListening,   setIsListening]   = useState(false);
  const [isRecording,   setIsRecording]   = useState(false);
  const [transcript,    setTranscript]    = useState([]);
  const [interim,       setInterim]       = useState("");
  const [suggestions,   setSuggestions]   = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [sessions,      setSessions]      = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [elapsed,       setElapsed]       = useState(0);
  const [toast,         setToast]         = useState(null);
  const [micStatus,     setMicStatus]     = useState("idle");
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [liveAudioURL,  setLiveAudioURL]  = useState(null);
  const [detailAudioURL,setDetailAudioURL]= useState(null);

  const recogRef    = useRef(null);
  const mediaRecRef = useRef(null);
  const audioChunks = useRef([]);
  const audioMime   = useRef("audio/webm");
  const debounceRef = useRef(null);
  const timerRef    = useRef(null);
  const startRef    = useRef(null);
  const sessionStart= useRef(null);
  const txRef       = useRef([]);
  const suggRef     = useRef([]);
  const panelRef    = useRef(null);
  const elapsedRef  = useRef(0);

  useEffect(() => { txRef.current   = transcript; },  [transcript]);
  useEffect(() => { suggRef.current = suggestions; }, [suggestions]);
  useEffect(() => { elapsedRef.current = elapsed; },  [elapsed]);

  useEffect(() => { openDB().then(loadSessions); }, []);

  async function loadSessions() {
    const all = await dbAll("sessions");
    all.sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
    setSessions(all);
  }

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  }, []);

  useEffect(() => {
    if (isListening) {
      startRef.current = Date.now() - elapsedRef.current * 1000;
      timerRef.current = setInterval(() =>
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isListening]);

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [transcript, interim]);

  // ── START ──
  const startSession = useCallback(async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicStatus("err"); return;
    }

    // MediaRecorder – välj bäst stödda format
    const mime = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"]
      .find(m => MediaRecorder.isTypeSupported(m)) || "";
    audioMime.current = mime || "audio/webm";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    audioChunks.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
    mr.start(1000);
    mediaRecRef.current = mr;
    setIsRecording(true);

    // SpeechRecognition
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.lang = "sv-SE";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onstart  = () => setMicStatus("on");
      rec.onerror  = () => setMicStatus("err");
      rec.onend    = () => { if (recogRef.current) setTimeout(() => rec.start(), 200); };
      rec.onresult = e => {
        let fin="", int="";
        for (let i=e.resultIndex; i<e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t; else int += t;
        }
        setInterim(int);
        if (fin.trim()) {
          const line = { text:fin.trim(), ts:new Date().toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) };
          setTranscript(p => [...p, line]);
          setInterim("");
          clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try { setSuggestions(await fetchSuggestions(fin.trim())); }
            catch { showToast("AI EJ TILLGÄNGLIG"); }
            finally { setLoading(false); }
          }, 2500);
        }
      };
      recogRef.current = rec;
      rec.start();
    } else {
      setMicStatus("err");
    }

    sessionStart.current = new Date().toISOString();
    setIsListening(true);
    setElapsed(0);
    setTranscript([]);
    setSuggestions([]);
    setLiveAudioURL(null);
  }, []);

  // ── STOPP ──
  const stopSession = useCallback(() => {
    const rec = recogRef.current;
    recogRef.current = null;
    rec?.stop();
    setMicStatus("idle");
    clearTimeout(debounceRef.current);

    const mr = mediaRecRef.current;
    mediaRecRef.current = null;

    const dur = elapsedRef.current;

    if (mr && mr.state !== "inactive") {
      mr.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: audioMime.current });
        const url  = URL.createObjectURL(blob);
        setLiveAudioURL(url);
        await saveSessionData(blob, blob.size, dur);
      };
      mr.stop();
      mr.stream?.getTracks().forEach(t => t.stop());
    } else {
      saveSessionData(null, 0, dur);
    }

    setIsListening(false);
    setIsRecording(false);
  }, []);

  async function saveSessionData(audioBlob, audioSize, dur) {
    const id = Date.now();
    const session = {
      id,
      startedAt:   sessionStart.current,
      duration:    dur,
      transcript:  txRef.current,
      suggestions: suggRef.current,
      hasAudio:    !!audioBlob,
      audioSize,
      audioMime:   audioMime.current,
    };
    await dbPut("sessions", session);
    if (audioBlob) {
      await dbPut("audio", { id, blob: audioBlob, mimeType: audioMime.current });
    }
    await loadSessions();
    showToast(audioBlob ? "SESSION + LJUD SPARAT ✓" : "SESSION SPARAD ✓");
  }

  async function openDetail(session) {
    setSelected(session);
    setDetailAudioURL(null);
    if (session.hasAudio) {
      const rec = await dbGet("audio", session.id);
      if (rec?.blob) setDetailAudioURL(URL.createObjectURL(rec.blob));
    }
  }

  async function deleteSession(id, e) {
    e.stopPropagation();
    await dbDelete("sessions", id);
    await dbDelete("audio", id);
    await loadSessions();
    showToast("RADERAD");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const copyCard = t => { navigator.clipboard?.writeText(t); showToast("KOPIERAT ✓"); };

  // ════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════
  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="scanline" />

        {/* HEADER */}
        <header className="hdr">
          <div className="logo">IVAI<span>.coach</span></div>
          <div className="nav">
            <button className={`nb ${view==="live"?"on":""}`} onClick={() => setView("live")}>◈ LIVE</button>
            <button className={`nb ${view==="history"?"on":""}`} onClick={() => { setView("history"); setSelected(null); setDetailAudioURL(null); }}>
              ⊞ {sessions.length > 0 ? sessions.length : ""}
            </button>
          </div>
        </header>

        {!isOnline && <div className="offbanner">▲ OFFLINE – allt sparas lokalt i telefonen</div>}

        {/* STATUS BAR */}
        <div className="sbar">
          <div className="si">
            <div className={`dot ${micStatus==="on"?"on":micStatus==="err"?"err":""}`} />
            {micStatus==="on" ? "LYSSNAR" : micStatus==="err" ? "MIC-FEL" : "STANDBY"}
          </div>
          {isRecording && (
            <div className="si"><div className="dot rec"/><span style={{color:"var(--danger)"}}>SPELAR IN</span></div>
          )}
          <div className="si">
            <div className={`dot ${isOnline?"ok":"warn"}`} />
            {isOnline ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="si"><div className="dot ok"/>{sessions.length} SESSIONER LOKALT</div>
        </div>

        {/* ══ LIVE VIEW ══ */}
        {view === "live" && (
          <div className="main">

            {/* Transkript */}
            <div className="panel">
              <div className="ph">
                <span className={`pt ${isListening?"on":""}`}>▸ TRANSKRIPT</span>
                <span style={{fontSize:"9px",color:"var(--dim)"}}>{transcript.length} RADER</span>
              </div>
              <div className="pb" ref={panelRef}>
                {transcript.length === 0 && !interim && (
                  <div className="empty">
                    <div className="ei">◎</div>
                    <div>Tryck START för att börja</div>
                    <div style={{fontSize:"9px"}}>Spelar in ljud + transkriberar</div>
                    <div style={{fontSize:"9px",color:"var(--accent2)"}}>Allt sparas lokalt i telefonen</div>
                  </div>
                )}
                {transcript.map((l,i) => (
                  <div key={i} className={`tl ${i===transcript.length-1?"new":""}`}>
                    <span className="ts">{l.ts}</span>{l.text}
                  </div>
                ))}
                {interim && <div className="intr">▸ {interim}</div>}
              </div>

              {/* Förhandslyssning direkt efter stopp */}
              {liveAudioURL && !isListening && (
                <div style={{padding:"0 14px 10px",flexShrink:0}}>
                  <div className="awrap">
                    <div className="albl">🎙 FÖRHANDSGRANSKA INSPELNING</div>
                    <audio controls src={liveAudioURL} />
                    <div className="ameta"><span>Sparad i telefonens databas</span></div>
                  </div>
                </div>
              )}

              <div className="ctrl">
                {!isListening
                  ? <button className="bm bstart" onClick={startSession}>◈ START</button>
                  : <button className="bm bstop" onClick={stopSession}>■ STOPP</button>
                }
                {isListening && <div className="rec-badge"><div className="dot rec"/>REC</div>}
                <div className={`timer ${isListening?"on":""}`}>{fmt(elapsed*1000)}</div>
              </div>
            </div>

            {/* AI-förslag */}
            <div className="panel">
              <div className="ph">
                <span className="pt on">▸ SVARFÖRSLAG</span>
                <span style={{fontSize:"9px",color:"var(--dim)"}}>TRYCK FÖR ATT KOPIERA</span>
              </div>
              <div className="pb">
                {loading && (
                  <div className="ld"><div className="dd"/><div className="dd"/><div className="dd"/>
                    <span style={{marginLeft:6}}>ANALYSERAR...</span>
                  </div>
                )}
                {!loading && suggestions.length === 0 && (
                  <div className="empty">
                    <div className="ei">⟡</div>
                    <div>AI-förslag visas här</div>
                    <div style={{fontSize:"9px"}}>{isOnline?"Aktiveras när intervjuaren pratar":"Offline – ej tillgängligt"}</div>
                  </div>
                )}
                {!loading && suggestions.map((s,i) => (
                  <div key={i} className="sc" onClick={() => copyCard(s)}>
                    <div className="cn">SVAR {i+1}</div>
                    <div className="ct">{s}</div>
                    <div className="ch">↗ tryck för att kopiera</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ HISTORIK ══ */}
        {view === "history" && !selected && (
          <div className="sv">
            <div className="hhdr">
              <div className="htitle">⊞ Sparade sessioner</div>
              {sessions.length > 0 && (
                <button className="bdel" onClick={async () => { await dbClear("sessions"); await dbClear("audio"); await loadSessions(); }}>
                  RENSA ALLT
                </button>
              )}
            </div>
            {sessions.length === 0 && (
              <div className="empty" style={{paddingTop:40}}>
                <div className="ei">⊟</div>
                <div>Inga sessioner sparade ännu</div>
              </div>
            )}
            {sessions.map(s => (
              <div key={s.id} className="scard" onClick={() => openDetail(s)}>
                <div style={{color:"var(--dim)",flexShrink:0,paddingTop:2}}>◈</div>
                <div className="sinfo">
                  <div className="sdate">{fmtDate(s.startedAt)}</div>
                  <div className="sprev">{s.transcript[0]?.text || "Tomt transkript"}</div>
                  <div className="sbadge">
                    {s.hasAudio ? `🎙 LJUD • ${fmtSize(s.audioSize)}` : "📝 TRANSKRIPT"}
                  </div>
                </div>
                <div className="smeta">
                  <div>{fmt(s.duration*1000)}</div>
                  <div>{s.transcript.length} rader</div>
                </div>
                <button className="bdel" onClick={e => deleteSession(s.id, e)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* ══ SESSION DETALJ ══ */}
        {view === "history" && selected && (
          <div className="sv">
            <div className="back" onClick={() => { setSelected(null); setDetailAudioURL(null); }}>← TILLBAKA</div>

            <div style={{marginBottom:14}}>
              <div style={{fontFamily:"var(--disp)",fontSize:"14px",letterSpacing:"3px",color:"var(--accent)"}}>{fmtDate(selected.startedAt)}</div>
              <div style={{fontSize:"10px",color:"var(--dim)",marginTop:4}}>
                {fmt(selected.duration*1000)} · {selected.transcript.length} rader
                {selected.hasAudio && ` · 🎙 ${fmtSize(selected.audioSize)}`}
              </div>
            </div>

            {/* EXPORT */}
            <div className="exp-row">
              <button className="bexp" onClick={async () => { await exportSession(selected); showToast("EXPORTERAR..."); }}>
                ↓ EXPORTERA SESSION
              </button>
              {selected.hasAudio && (
                <button className="bexp" onClick={async () => {
                  const rec = await dbGet("audio", selected.id);
                  if (rec?.blob) {
                    const ext = rec.mimeType?.includes("ogg")?"ogg":rec.mimeType?.includes("mp4")?"m4a":"webm";
                    dlBlob(rec.blob, `ivai_${selected.id}_ljud.${ext}`);
                    showToast("LADDAR NER LJUD...");
                  }
                }}>
                  ↓ LADDA NER LJUD
                </button>
              )}
            </div>

            {/* LJUD */}
            {selected.hasAudio && (
              <div className="dsec">
                <div className="dlbl">Inspelning</div>
                {detailAudioURL
                  ? <div className="awrap">
                      <div className="albl">🎙 SPELA UPP</div>
                      <audio controls src={detailAudioURL} style={{width:"100%",height:36,filter:"invert(1) hue-rotate(150deg) saturate(.6)",opacity:.85}} />
                      <div className="ameta"><span>{fmtSize(selected.audioSize)}</span><span>{selected.audioMime?.split(";")[0]}</span></div>
                    </div>
                  : <div style={{fontSize:"10px",color:"var(--dim)",padding:"6px 0"}}>Laddar ljud...</div>
                }
              </div>
            )}

            {/* TRANSKRIPT */}
            <div className="dsec">
              <div className="dlbl">Transkript</div>
              {selected.transcript.length === 0
                ? <div style={{fontSize:"10px",color:"var(--dim)"}}>Inget transkript</div>
                : selected.transcript.map((l,i) => (
                    <div key={i} className="tl"><span className="ts">{l.ts}</span>{l.text}</div>
                  ))
              }
            </div>

            {/* AI-FÖRSLAG */}
            {selected.suggestions?.length > 0 && (
              <div className="dsec">
                <div className="dlbl">Sista AI-förslag</div>
                {selected.suggestions.map((s,i) => (
                  <div key={i} className="sc" onClick={() => copyCard(s)}>
                    <div className="cn">SVAR {i+1}</div>
                    <div className="ct">{s}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
