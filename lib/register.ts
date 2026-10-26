// The spirits that keep coming back. Every entry here turned up in
// data/sweep.json (Whisper base, listening to silence, hiss and hum in 24
// languages); the meanings are plain translations of what it said.

export type Kind = "credit" | "farewell" | "voice" | "chant" | "number";

export type Ghost = {
  id: string;
  lang: string;
  match: RegExp;
  kind: Kind;
  // what the words mean in English
  meaning: string;
};

export const KINDS: Record<Kind, { name: string; why: string }> = {
  credit: {
    name: "A name from the credits",
    why: "Subtitles for TV end with who made them, over the silent last seconds of a show. Whisper learned that silence sounds like those names. These are the spirits it believes in most: it is sure nobody is talking, and just as sure about the names.",
  },
  farewell: {
    name: "The end of a video",
    why: "Silence usually comes right after someone says goodbye to the camera, so silence brings the goodbye back.",
  },
  voice: {
    name: "A sentence nobody said",
    why: "No credit, no goodbye. Just the likeliest words for a room with nobody in it.",
  },
  chant: {
    name: "A chant",
    why: "The decoder falls into a loop and can't get out. Whisper's guard calls this too repetitive and tries again.",
  },
  number: {
    name: "A number",
    why: "Plain hiss, heard as Norwegian Nynorsk, comes out as a number.",
  },
};

export const REGISTER: Ghost[] = [
  { id: "gelderland", lang: "nl", match: /TV GELDERLAND/i, kind: "credit", meaning: "The name of a Dutch regional TV channel, and a year." },
  { id: "subtitry", lang: "ru", match: /Редактор субтитров/i, kind: "credit", meaning: "Subtitle editor (a name), proofreader (a name)." },
  { id: "swr", lang: "de", match: /^SWR \d{4}/, kind: "credit", meaning: "The name of a German public broadcaster, and a year." },
  { id: "trt", lang: "tr", match: /betimlemesi\s+TRT/i, kind: "credit", meaning: "The audio description of this series was made for TRT, Turkey's public broadcaster." },
  { id: "arigatou", lang: "ja", match: /動画を見てくれてありがとう/, kind: "farewell", meaning: "Well, thanks for watching this video!" },
  { id: "autre-video", lang: "fr", match: /autre vidéo/i, kind: "farewell", meaning: "I invite you to make yourself another video." },
  { id: "mannayo", lang: "ko", match: /영상에서.*만나요/, kind: "farewell", meaning: "See you in this video (the end of \"see you in the next video\")." },
  { id: "gomawoyo", lang: "ko", match: /^고마워요/, kind: "farewell", meaning: "Thank you." },
  { id: "terima-kasih", lang: "id", match: /^Terima kasih/i, kind: "farewell", meaning: "Thank you (very much)." },
  { id: "berhenti", lang: "id", match: /berhenti di sini/i, kind: "farewell", meaning: "And I will stop here." },
  { id: "thank-you", lang: "en", match: /^thank you\.?$/i, kind: "farewell", meaning: "Thank you." },
  { id: "you", lang: "en", match: /^you\.?$/i, kind: "voice", meaning: "Just \"you\". The most famous of Whisper's ghosts: it says it to silence." },
  { id: "kan-ni", lang: "zh", match: /^我看你/, kind: "voice", meaning: "I'm looking at you." },
  { id: "bu-xiang-yao", lang: "zh", match: /你不想要我/, kind: "voice", meaning: "You don't want me." },
  { id: "mei-jian-dao", lang: "zh", match: /我以为你还没见到我/, kind: "voice", meaning: "I thought you hadn't seen me yet." },
  { id: "you-shi", lang: "zh", match: /我以[為为]你會不會有事/, kind: "voice", meaning: "I thought something might have happened to you." },
  { id: "o-day", lang: "vi", match: /Chúng ta sẽ ở đây/i, kind: "voice", meaning: "We will be here." },
  { id: "quay-lai", lang: "vi", match: /Chúng ta có thể quay lại/i, kind: "voice", meaning: "We can go back." },
  { id: "ne-hovoryly", lang: "uk", match: /Ви не говорили/i, kind: "voice", meaning: "Weren't you speaking?" },
  { id: "vyrishytysia", lang: "uk", match: /не може вирішитися/i, kind: "voice", meaning: "He can't make up his mind." },
  { id: "kokoro", lang: "ja", match: /私の心を見つけ/, kind: "voice", meaning: "I will find my heart." },
  { id: "bathroom", lang: "en", match: /go to the bathroom/i, kind: "voice", meaning: "I'm going to go to the bathroom." },
  { id: "oh-my-god", lang: "en", match: /^oh,? my god/i, kind: "voice", meaning: "Oh, my God." },
  { id: "amma", lang: "ta", match: /அம்மா/, kind: "voice", meaning: "Amma: mother." },
  { id: "igoseun", lang: "ko", match: /^(이곳은\s*){3,}/, kind: "chant", meaning: "This place is, this place is, this place is…" },
  { id: "shree", lang: "hi", match: /^(Shree,?\s*){3,}/i, kind: "chant", meaning: "Shree, Shree, Shree: the word said before a holy name." },
  { id: "dhag", lang: "mr", match: /^(dhag){3,}/i, kind: "chant", meaning: "Dhag-dhag-dhag: the sound word for a fire blazing." },
  { id: "one-five", lang: "nn", match: /^1[.,]5\s?%$/, kind: "number", meaning: "1.5%" },
];

// the first register entry these words match, for this language or any other
export function identify(text: string, lang?: string): Ghost | null {
  const t = text.trim();
  if (!t) return null;
  const pool = lang ? [...REGISTER.filter((g) => g.lang === lang), ...REGISTER.filter((g) => g.lang !== lang)] : REGISTER;
  return pool.find((g) => g.match.test(t)) ?? null;
}
