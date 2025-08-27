let cachedVoices = [];
let voicesReadyResolve;
const voicesReady = new Promise((res) => { voicesReadyResolve = res; });

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length) {
    cachedVoices = voices;
    if (voicesReadyResolve) voicesReadyResolve(true);
  }
  return voices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
}

export async function ready() {
  loadVoices();
  return voicesReady;
}

export function pickVoice({ lang = 'en-US', gender = 'female' } = {}) {
  const voices = cachedVoices.length ? cachedVoices : loadVoices();
  if (!voices || !voices.length) return undefined;

  const langNorm = (lang || 'en-US').toLowerCase();
  const candidates = voices.filter(v => (v.lang || '').toLowerCase().startsWith(langNorm.slice(0,2)) || (v.lang || '').toLowerCase() === langNorm);

  const femaleHints = [/female/i, /woman/i, /samantha|victoria|google.*female|zia/i, /neural.*female/i];
  const maleHints = [/male/i, /man/i, /daniel|alex|fred|google.*male/i, /neural.*male/i];
  const hints = gender === 'male' ? maleHints : femaleHints;

  const byGender = candidates.find(v => hints.some(h => h.test(v.name))) || voices.find(v => hints.some(h => h.test(v.name)));
  if (byGender) return byGender.name;

  const byLang = candidates[0];
  return byLang ? byLang.name : voices[0]?.name;
}

export function speak(text, { rate = 1, pitch = 1, volume = 1, lang = 'en-US', voiceName } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!text) return;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  utter.pitch = pitch;
  utter.volume = volume;
  utter.lang = lang;

  if (!voiceName) {
    const picked = pickVoice({ lang, gender: 'female' });
    voiceName = picked;
  }
  if (voiceName) {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => v.name === voiceName);
    if (match) utter.voice = match;
  }

  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
} 
