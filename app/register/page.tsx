import type { Metadata } from "next";
import Link from "next/link";
import sweep from "@/data/sweep.json";
import { KINDS, REGISTER, type Kind } from "@/lib/register";

export const metadata: Metadata = {
  title: "The register · Anyone there?",
  description: "Every spirit Whisper heard in 504 windows of silence, hiss and hum, in 24 languages: what it said, what it means, and whether Whisper's own guard let it through.",
};

type Row = { lang: string; kind: string; db: number; seed: number; text: string; noSpeech: number; avgLogprob: number; outcome: string; heardAs: string };
const rows = sweep.rows as Row[];

const name = (code: string) => new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
const ORDER: Kind[] = ["credit", "farewell", "voice", "chant", "number"];

function most<T>(xs: T[]): [T, number] {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0];
}

export default function Register() {
  const kept = rows.filter((r) => r.outcome === "kept").length;
  const retried = rows.filter((r) => r.outcome === "retried").length;
  const dropped = rows.filter((r) => r.outcome === "dropped").length;
  const langs = new Set(rows.map((r) => r.lang)).size;
  const [heardAs, heardAsCount] = most(rows.map((r) => r.heardAs));

  return (
    <main className="wrap register">
      <h1 className="title small-title">The register</h1>
      <p className="lede">
        Whisper base listened to {rows.length} windows of nothing: digital silence, and white, pink and brown noise and mains hum at different levels, eight seconds each, in {langs} languages. Not one of them had a voice in it. It still
        said something in almost all of them.
      </p>

      <div className="stats">
        <div>
          <strong>{kept}</strong>
          <span>would reach a transcript with Whisper&apos;s default settings</span>
        </div>
        <div>
          <strong>{retried}</strong>
          <span>Whisper would decode again, hotter</span>
        </div>
        <div>
          <strong>{dropped}</strong>
          <span>its guard would drop as silence</span>
        </div>
        <div>
          <strong>{Math.round((heardAsCount / rows.length) * 100)}%</strong>
          <span>of the time, the static itself sounded like {name(heardAs)} to it</span>
        </div>
      </div>

      {ORDER.map((kind) => {
        const ghosts = REGISTER.filter((g) => g.kind === kind);
        return (
          <section key={kind} className="card">
            <h2>{KINDS[kind].name}s</h2>
            <p className="muted small">{KINDS[kind].why}</p>
            <ul className="ghosts">
              {ghosts.map((g) => {
                const seen = rows.filter((r) => g.match.test(r.text.trim()));
                const [example] = most(seen.map((r) => r.text));
                const through = seen.filter((r) => r.outcome === "kept").length;
                const ns = seen.reduce((a, r) => a + r.noSpeech, 0) / seen.length;
                return (
                  <li key={g.id} id={g.id}>
                    <p className="said" lang={g.lang}>
                      {example}
                    </p>
                    <p>{g.meaning}</p>
                    <p className="small muted">
                      {name(g.lang)} · heard {seen.length} time{seen.length === 1 ? "" : "s"} · Whisper {Math.round(ns * 100)}% sure nobody spoke ·{" "}
                      <span className={`tag ${through ? "kept" : "dropped"}`}>{through ? `got past the guard ${through} of ${seen.length}` : "the guard caught it every time"}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="card">
        <h2>Run it yourself</h2>
        <p>
          Same model files, same static, same spirits. <code>npm run sweep</code> rebuilds this page&apos;s data from scratch on your own machine in about six minutes, and the tests check that every entry here really turned up. The model is{" "}
          <a href="https://huggingface.co/onnx-community/whisper-base">whisper-base</a>, quantised to 8 bits.
        </p>
        <p>
          <Link href="/">Back to the séance</Link>
        </p>
      </section>
    </main>
  );
}
