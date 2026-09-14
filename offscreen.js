let activeAudio = null;
let activeUtterance = null;

function normalizeVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1, Math.max(0, numeric));
}
let playbackGeneration = 0;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stopActivePlayback() {
  playbackGeneration += 1;
  if (activeAudio) {
    try { activeAudio.pause(); } catch (_) {}
    activeAudio = null;
  }
  if ("speechSynthesis" in globalThis) {
    try { speechSynthesis.cancel(); } catch (_) {}
  }
  activeUtterance = null;
  return playbackGeneration;
}

function buildOnlineSources(text, lang) {
  const encodedText = encodeURIComponent(String(text || "").trim());
  const language = String(lang || "en-US");
  const encodedLang = encodeURIComponent(language);
  const sources = [
    {
      name: `Google audio (${language})`,
      url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodedLang}&q=${encodedText}`
    },
    {
      name: `Google Translate audio (${language})`,
      url: `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodedLang}&q=${encodedText}`
    }
  ];
  if (/^zh(?:-|$)/i.test(language)) {
    sources.push({
      name: "Youdao Chinese audio",
      url: `https://dict.youdao.com/dictvoice?audio=${encodedText}&type=2`
    });
  }
  return sources;
}

async function loadAudioBlobUrl(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Audio server returned ${response.status}.`);

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("html")) {
      throw new Error("The audio server returned text instead of sound.");
    }

    const blob = await response.blob();
    if (blob.size < 128) throw new Error("The audio server returned an empty or invalid sound file.");
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Audio download timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function playBlobUrl(blobUrl, generation, volume = 1, timeoutMs = 16000) {
  return new Promise((resolve, reject) => {
    if (generation !== playbackGeneration) {
      reject(new Error("Pronunciation was replaced by a newer request."));
      return;
    }

    const audio = new Audio(blobUrl);
    activeAudio = audio;
    audio.preload = "auto";
    audio.volume = normalizeVolume(volume);

    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.onended = null;
      audio.onerror = null;
      if (activeAudio === audio) activeAudio = null;
      if (error) reject(error);
      else resolve();
    };

    const timeout = setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      finish(new Error("Online audio playback timed out."));
    }, timeoutMs);

    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Edge could not decode this pronunciation source."));

    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        finish(new Error(error?.message || "Edge blocked online audio playback."));
      });
    }
  });
}

async function playLoadedSource(blobUrl, repeat, generation, volume = 1) {
  for (let index = 0; index < repeat; index += 1) {
    if (generation !== playbackGeneration) {
      throw new Error("Pronunciation was replaced by a newer request.");
    }
    await playBlobUrl(blobUrl, generation, volume);
    if (index < repeat - 1) await delay(550);
  }
}

async function playOnline(text, { lang = "zh-CN", repeat = 2, generation, volume = 1 } = {}) {
  if (!navigator.onLine) throw new Error("Edge is offline, so online pronunciation is unavailable.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("There is no pronunciation text.");

  const count = Math.min(4, Math.max(1, Number(repeat) || 2));
  const sources = buildOnlineSources(clean, lang);
  const failures = [];

  // Fetch all small pronunciation candidates together. This avoids spending
  // more than 30 seconds waiting sequentially while an AUDIO_PLAYBACK offscreen
  // document has not started producing sound yet.
  const loaded = await Promise.all(sources.map(async (source) => {
    try {
      return { source, blobUrl: await loadAudioBlobUrl(source.url), error: null };
    } catch (error) {
      return { source, blobUrl: null, error };
    }
  }));

  // A source is accepted only after it downloads, decodes, and completes both
  // readings. Some providers return a status-200 non-audio response for a few words.
  for (const candidate of loaded) {
    if (candidate.error) {
      failures.push(`${candidate.source.name}: ${candidate.error.message}`);
      continue;
    }

    try {
      await playLoadedSource(candidate.blobUrl, count, generation, volume);
      for (const item of loaded) {
        if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      }
      return { ok: true, engine: candidate.source.name, repeat: count };
    } catch (error) {
      failures.push(`${candidate.source.name}: ${error.message}`);
      if (generation !== playbackGeneration) {
        for (const item of loaded) {
          if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
        }
        throw error;
      }
    }
  }

  for (const item of loaded) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  throw new Error(failures.join(" | ") || "No online pronunciation source worked.");
}

function waitForVoices(timeoutMs = 1500) {
  const immediate = speechSynthesis.getVoices();
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

function chooseVoiceForLanguage(voices, lang) {
  const requested = String(lang || "en-US").replace("_", "-").toLowerCase();
  const base = requested.split("-")[0];
  return voices.find((voice) => String(voice.lang || "").replace("_", "-").toLowerCase() === requested) ||
    voices.find((voice) => String(voice.lang || "").replace("_", "-").toLowerCase().startsWith(`${base}-`)) ||
    voices.find((voice) => String(voice.lang || "").toLowerCase() === base) ||
    null;
}

function speakOne(text, { lang, rate, voice, generation, volume = 1 }) {
  return new Promise((resolve, reject) => {
    if (generation !== playbackGeneration) {
      reject(new Error("Pronunciation was replaced by a newer request."));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.volume = normalizeVolume(volume);
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Web Speech did not start."));
    }, 12000);

    utterance.onend = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeUtterance = null;
      resolve();
    };
    utterance.onerror = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeUtterance = null;
      reject(new Error(event.error || "Web Speech synthesis failed."));
    };
    speechSynthesis.speak(utterance);
  });
}

async function playWithSystemFallback(text, {
  lang = "en-US",
  rate = 0.82,
  repeat = 2,
  fallbackText = "",
  fallbackLang = "en-US",
  generation,
  volume = 1
} = {}) {
  if (!("speechSynthesis" in globalThis) || !("SpeechSynthesisUtterance" in globalThis)) {
    throw new Error("No system speech engine is available.");
  }

  const voices = await waitForVoices();
  const primaryVoice = chooseVoiceForLanguage(voices, lang);
  const fallback = String(fallbackText || "").trim();
  const useFallback = !primaryVoice && Boolean(fallback);
  const spokenText = useFallback ? fallback : text;
  const spokenLang = useFallback ? fallbackLang : lang;
  const voice = chooseVoiceForLanguage(voices, spokenLang);
  const count = Math.min(4, Math.max(1, Number(repeat) || 2));
  speechSynthesis.cancel();

  for (let index = 0; index < count; index += 1) {
    await speakOne(spokenText, {
      lang: spokenLang,
      rate: Number(rate) || 0.82,
      voice,
      generation,
      volume
    });
    if (index < count - 1) await delay(550);
  }

  return {
    ok: true,
    engine: voice?.name || `system speech (${spokenLang})`,
    repeat: count
  };
}

async function playPronunciation(message, generation) {
  const options = { ...message, generation };
  const failures = [];

  try {
    return await playOnline(message.text, options);
  } catch (error) {
    failures.push(error.message);
  }

  // If the main term cannot be played, try the pack-defined fallback reading
  // before using the browser's installed speech voices.
  if (String(message.fallbackText || "").trim()) {
    try {
      return await playOnline(message.fallbackText, {
        ...options,
        lang: message.fallbackLang || "en-US"
      });
    } catch (error) {
      failures.push(`Reading fallback: ${error.message}`);
    }
  }

  try {
    return await playWithSystemFallback(message.text, options);
  } catch (error) {
    failures.push(`System fallback: ${error.message}`);
  }

  throw new Error(failures.join(" | "));
}


async function playSpeechSequence(message, generation) {
  const rawSegments = Array.isArray(message.segments) && message.segments.length
    ? message.segments
    : [message];
  const segments = rawSegments.filter((segment) => String(segment?.text || "").trim());
  if (!segments.length) throw new Error("No speech segments were supplied.");

  const results = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (generation !== playbackGeneration) {
      throw new Error("Pronunciation was replaced by a newer request.");
    }
    const result = await playPronunciation(segments[index], generation);
    results.push({ label: segments[index].label || `segment-${index + 1}`, ...result });
    if (index < segments.length - 1) await delay(800);
  }

  return {
    ok: true,
    engine: results.map((item) => `${item.label}: ${item.engine}`).join("; "),
    repeat: results.map((item) => item.repeat),
    segmentCount: results.length
  };
}

function reportResult(payload) {
  chrome.runtime.sendMessage({
    target: "background",
    type: "TTS_RESULT",
    ...payload
  }).catch(() => {
    // The sound has already completed or failed. Do not create another visible
    // message-channel error if the service worker happens to be sleeping.
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message?.type !== "PLAY_ONLINE_TTS") return false;

  const requestId = String(message.requestId || `${Date.now()}-${Math.random()}`);
  const generation = stopActivePlayback();

  // Acknowledge synchronously. Audio may take many seconds, and keeping the
  // original message channel open for the full playback can make Edge report
  // "message channel closed before a response was received".
  sendResponse({ ok: true, accepted: true, requestId });

  setTimeout(() => {
    playSpeechSequence(message, generation)
      .then((result) => reportResult({
        requestId,
        cardId: message.cardId || null,
        ok: true,
        engine: result.engine,
        repeat: result.repeat,
        segmentCount: result.segmentCount || 1,
        completedAt: Date.now()
      }))
      .catch((error) => reportResult({
        requestId,
        cardId: message.cardId || null,
        ok: false,
        error: error.message,
        completedAt: Date.now()
      }));
  }, 0);

  return false;
});
