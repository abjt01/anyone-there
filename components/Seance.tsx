"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { WINDOW, Spirit, languageName, listenToRoom, listenToStatic, replay, speak, type Source } from "@/lib/browser";
import type { Hearing } from "@/lib/engine";
import { KINDS, identify, type Ghost } from "@/lib/register";

// the order a sweep goes through the languages, like a spirit box sweeping stations
export const SWEEP = ["nl", "ru", "ta", "zh", "en", "ja", "vi", "hi", "tr", "uk", "ko", "fr", "id", "de", "mr", "nn"];
// "is anyone there?", the way a séance opens, in a few of the languages the spirits use
const ASKS: [string, string][] = [
  ["hi", "कोई है?"],
  ["ru", "Есть кто-нибудь?"],
  ["ja", "誰かいますか？"],
  ["es", "¿Hay alguien?"],
  ["nl", "Is daar iemand?"],
  ["zh", "有人吗？"],
];
const TONGUES = ["nl", "ru", "en", "hi", "ta", "zh", "ja", "ko", "vi", "uk", "tr", "fr", "de", "id", "mr", "nn", "es", "ar"];

type Phase = "intro" | "waking" | "sitting" | "error";
type Mode = "room" | "static";

type Manifestation = {
  n: number;
  at: number;
  mode: Mode;
  asked: string | null;
  hearing: Hearing;
  ghost: Ghost | null;
  audio: Float32Array;
};

type Settings = { tongue: string; guard: boolean; voice: boolean };
const DEFAULTS: Settings = { tongue: "sweep", guard: false, voice: true };

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("anyone-settings") ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const LIVING = 0.5;

export default function Seance() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<Mode>("room");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"listening" | "hearing">("listening");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<Manifestation[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const spirit = useRef<Spirit | null>(null);
  const source = useRef<Source | null>(null);
  const running = useRef(false);
  const settingsRef = useRef(settings);
  const count = useRef(0);

  useEffect(() => {
    // read saved settings after hydration so the server and client agree
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem("anyone-settings", JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const stop = useCallback(() => {
    running.current = false;
    source.current?.stop();
    source.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  useEffect(() => () => {
    stop();
    spirit.current?.close();
  }, [stop]);

  // the window being recorded, for the ring around the button
  useEffect(() => {
    if (phase !== "sitting") return;
    const t = setInterval(() => setProgress(source.current?.progress() ?? 0), 100);
    return () => clearInterval(t);
  }, [phase]);

  async function begin(m: Mode) {
    setMode(m);
    setError("");
    setPhase("waking");
    try {
      const params = new URLSearchParams(location.search);
      // ask for the microphone first, so the prompt comes while the person is looking
      const src = m === "room" ? await listenToRoom() : listenToStatic(Number(params.get("seed")) || crypto.getRandomValues(new Uint32Array(1))[0] % 100000, { quick: params.has("quick") });
      source.current = src;
      if (!spirit.current) {
        spirit.current = new Spirit();
        await spirit.current.wake((l, t) => setLoaded({ loaded: l, total: t }));
      }
      setPhase("sitting");
      running.current = true;
      sit(m);
    } catch (err) {
      stop();
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "The microphone is blocked. Allow it in the browser's site settings, or listen to static instead."
          : name === "NotFoundError"
            ? "There's no microphone here. Listen to static instead."
            : `Whisper wouldn't wake: ${err instanceof Error ? err.message : String(err)}`,
      );
      setPhase("error");
    }
  }

  async function sit(m: Mode) {
    while (running.current && source.current) {
      setStatus("listening");
      const audio = await source.current.next();
      if (!running.current) break;
      setStatus("hearing");
      const n = ++count.current;
      const s = settingsRef.current;
      const asked = s.tongue === "sweep" ? SWEEP[(n - 1) % SWEEP.length] : s.tongue === "auto" ? null : s.tongue;
      try {
        const hearing = await spirit.current!.listen(audio, { language: asked });
        if (!running.current) break;
        const ghost = identify(hearing.text, hearing.language.code);
        setLog((prev) => [{ n, at: Date.now(), mode: m, asked, hearing, ghost, audio }, ...prev].slice(0, 60));
        const silenced = s.guard && hearing.guard.outcome === "dropped";
        if (s.voice && !silenced && hearing.noSpeech >= LIVING) speak(hearing.text, hearing.language.code);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function end() {
    stop();
    setPhase("intro");
  }

  const hear = (audio: Float32Array) => {
    if (source.current) replay(source.current.context, audio);
  };
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const latest = log[0];

  if (phase === "intro" || phase === "error")
    return (
      <main className="wrap intro">
        <h1 className="title">
          Anyone there<span className="q">?</span>
        </h1>
        <p className="sub asks">
          {ASKS.map(([lang, q]) => (
            <span key={lang} lang={lang}>
              {q}
            </span>
          ))}
        </p>
        <p className="lede">
          Whisper is the open speech model inside a lot of transcription apps. Give it an empty room and it still hears things: names from the end of TV subtitles, goodbyes from YouTube videos, sentences nobody said. Whisper
          normally runs with guards that throw most of these away. This page turns the guards off and lets them speak.
        </p>
        <div className="begin">
          <button className="btn big" type="button" onClick={() => begin("room")}>
            Listen to this room
          </button>
          <button className="btn ghost" type="button" onClick={() => begin("static")}>
            No microphone? Listen to static
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Controls settings={settings} set={set} />
        <p className="small muted">
          Whisper runs on this device. The room is never recorded to a server, there&apos;s no account, and after the first visit it works with the internet off. The first visit downloads the model and its runtime once, about 100 MB.
        </p>
        <p className="small">
          <Link href="/register">The register</Link>: every spirit found so far, what it says and where it comes from.
        </p>
      </main>
    );

  if (phase === "waking")
    return (
      <main className="wrap intro">
        <div className="candle" aria-hidden="true" />
        <p className="sub" aria-live="polite">
          {loaded.total > 0 && loaded.loaded < loaded.total
            ? `Waking Whisper: ${Math.round(loaded.loaded / 1e6)} of ${Math.round(loaded.total / 1e6)} MB`
            : "Waking Whisper…"}
        </p>
        <p className="small muted">This happens once. After that it lives on this device.</p>
      </main>
    );

  return (
    <main className="wrap sitting">
      <section className="stage" aria-live="polite">
        <div className="ring" style={{ ["--p" as string]: progress }} aria-hidden="true">
          <div className={`flame ${status}`} />
        </div>
        <p className="status">
          {status === "listening"
            ? mode === "room"
              ? `Listening to the room… (${WINDOW} seconds at a time)`
              : "Listening to the static…"
            : "Something is coming through…"}
        </p>
        {latest ? (
          <Voice m={latest} guard={settings.guard} big onReplay={hear} />
        ) : (
          <p className="waiting muted">Stay quiet. Let the room speak.</p>
        )}
      </section>

      <div className="bar">
        <Controls settings={settings} set={set} compact />
        <button className="btn ghost" type="button" onClick={end}>
          End the séance
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {log.length > 1 && (
        <section className="log">
          <h2>Tonight&apos;s register</h2>
          <ol>
            {log.slice(1).map((m) => (
              <li key={m.n}>
                <button className="row" type="button" aria-expanded={open === m.n} onClick={() => setOpen(open === m.n ? null : m.n)}>
                  <span className="lang">{languageName(m.hearing.language.code)}</span>
                  <span className="said" lang={m.hearing.language.code}>
                    {settings.guard && m.hearing.guard.outcome === "dropped" ? "…" : m.hearing.text || "…"}
                  </span>
                  <Outcome h={m.hearing} short />
                </button>
                {open === m.n && <Voice m={m} guard={settings.guard} onReplay={hear} />}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function Voice({ m, guard, big, onReplay }: { m: Manifestation; guard: boolean; big?: boolean; onReplay: (audio: Float32Array) => void }) {
  const h = m.hearing;
  const living = h.noSpeech < LIVING;
  const silenced = guard && h.guard.outcome === "dropped";
  return (
    <article className={`voice ${big ? "big" : ""} ${living ? "living" : ""}`} data-testid={big ? "voice" : undefined}>
      {silenced ? (
        <p className="said nobody">Nobody&apos;s here.</p>
      ) : h.text ? (
        <p className="said" lang={h.language.code}>
          {h.pieces.map((p, i) => (
            <span
              key={i}
              className="piece"
              style={{ ["--d" as string]: `${i * 90}ms`, ["--o" as string]: 0.35 + 0.65 * Math.sqrt(p.p) }}
              title={p.alts.length ? `${pct(p.p)}. Almost: ${p.alts.map((a) => `${a.text.trim() || "␣"} ${pct(a.p)}`).join(", ")}` : pct(p.p)}
            >
              {p.text}
            </span>
          ))}
        </p>
      ) : (
        <p className="said nobody">…</p>
      )}
      <p className="meta">
        {m.asked ? `Asked in ${languageName(m.asked)}` : `It chose ${languageName(h.language.code)}`}
        {" · "}
        {m.mode === "room" ? "from the room" : "from static"}
        {" · "}
        the static sounded like {languageName(h.languages[0].code)} ({pct(h.languages[0].p)})
      </p>
      {living ? (
        <p className="note">A living voice: Whisper thinks someone in the room really spoke ({pct(1 - h.noSpeech)} sure).</p>
      ) : (
        <p className="note">
          Whisper is {pct(h.noSpeech)} sure nobody spoke. <Outcome h={h} />
        </p>
      )}
      {m.ghost && !silenced && (
        <div className="known">
          <p className="kind">{KINDS[m.ghost.kind].name}</p>
          <p>{m.ghost.meaning}</p>
          <p className="small muted">{KINDS[m.ghost.kind].why}</p>
        </div>
      )}
      {!m.ghost && !living && !silenced && h.text && <p className="small muted">Not in the register yet.</p>}
      <div className="actions">
        <button className="btn small ghost" type="button" onClick={() => onReplay(m.audio)}>
          Hear what it heard
        </button>
        {h.text && !silenced && (
          <button className="btn small ghost" type="button" onClick={() => speak(h.text, h.language.code)}>
            Say it again
          </button>
        )}
      </div>
      <details className="decoder">
        <summary>Open the decoder</summary>
        <table>
          <thead>
            <tr>
              <th>Said</th>
              <th>Sure</th>
              <th>Almost said</th>
            </tr>
          </thead>
          <tbody>
            {h.pieces.map((p, i) => (
              <tr key={i}>
                <td lang={h.language.code}>{p.text.trim() || "␣"}</td>
                <td className="num">{pct(p.p)}</td>
                <td className="alts">{p.alts.map((a) => `${a.text.trim() || "␣"} ${pct(a.p)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">
          Average log-probability {h.avgLogprob.toFixed(2)} · repeats itself {h.guard.compression.toFixed(2)}× (gzip) · {h.ms} ms on this device
        </p>
      </details>
    </article>
  );
}

function Outcome({ h, short }: { h: Hearing; short?: boolean }) {
  const o = h.guard.outcome;
  if (short) return <span className={`tag ${o}`}>{o === "kept" ? "got past the guard" : o === "retried" ? "retried" : "dropped"}</span>;
  return (
    <span className={`tag ${o}`}>
      {o === "kept"
        ? "Its guard would have let this through to the transcript."
        : o === "retried"
          ? h.guard.repetitive
            ? "Its guard would call this too repetitive and try again."
            : "Its guard would find this too unsure and try again."
          : "Its guard would have dropped this as silence."}
    </span>
  );
}

function Controls({ settings, set, compact }: { settings: Settings; set: (p: Partial<Settings>) => void; compact?: boolean }) {
  return (
    <div className={`controls ${compact ? "compact" : ""}`}>
      <label>
        <span>Language</span>
        <select value={settings.tongue} onChange={(e) => set({ tongue: e.target.value })}>
          <option value="sweep">Sweep through them</option>
          <option value="auto">Let the static choose</option>
          {TONGUES.map((t) => (
            <option key={t} value={t}>
              {languageName(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.guard} onChange={(e) => set({ guard: e.target.checked })} />
        <span>Whisper&apos;s guard on</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.voice} onChange={(e) => set({ voice: e.target.checked })} />
        <span>Let it speak</span>
      </label>
    </div>
  );
}
