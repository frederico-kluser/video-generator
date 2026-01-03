# VAD Libraries for ReactJS Audio Editors: A Technical Guide

**Bark is NOT a VAD library—it's Suno's text-to-speech model.** For browser-based Voice Activity Detection in ReactJS, **@ricky0123/vad-web** is the clear production-ready choice, providing ML-powered silence detection via the Silero VAD model running in WebAssembly. Pair it with **ffmpeg.wasm** for audio cutting and **wavesurfer.js** for waveform visualization to build a complete auto-pause-removal editor like Descript or Cleanvoice.

---

## The "Bark" confusion explained

The user likely encountered Suno's Bark (github.com/suno-ai/bark), which is a **text-to-speech generative model** with **38,700+ GitHub stars**—not a VAD tool. Bark converts text into realistic speech audio, the exact opposite of what's needed. It cannot detect speech presence, analyze silence, or process audio input.

The confusion likely stems from Bark's prominence in audio AI discussions. The library the user actually needs is **Silero VAD** or its JavaScript wrapper **@ricky0123/vad-web**, which detects when speech occurs in audio and returns precise timestamps.

---

## Browser-compatible VAD libraries compared

| Library | Type | Browser | Accuracy | Maintained | npm Package | License |
|---------|------|---------|----------|------------|-------------|---------|
| **@ricky0123/vad-web** | ML (Silero) | ✅ | ★★★★★ | Active (Nov 2025) | `@ricky0123/vad-web` | ISC |
| Silero VAD | ML | DIY only | ★★★★★ | Active | Python only | MIT |
| Picovoice Cobra | ML | ✅ | ★★★★★ | Active | `@picovoice/cobra-web` | Commercial |
| hark.js | Energy-based | ✅ | ★★☆☆☆ | ❌ Dead (2016) | `hark` | MIT |
| voice-activity-detection | Energy-based | ✅ | ★★☆☆☆ | ❌ Dead (2017) | `voice-activity-detection` | MIT |
| node-vad | WebRTC | ❌ Node only | ★★★☆☆ | ❌ Dead | `node-vad` | MIT |

**@ricky0123/vad-web dominates** with 1,700+ stars, 50,000+ weekly npm downloads, and active development through November 2025. It uses the enterprise-grade Silero VAD model running via ONNX Runtime Web, providing accuracy that energy-based alternatives like hark.js simply cannot match. The library distinguishes actual speech from keyboard clicks, background noise, and music—critical for reliable silence detection.

The **bundle size trade-off is approximately 4MB** due to the ONNX model files, but this is justified by the significant accuracy improvement over the ~10KB hark.js, which triggers false positives on any loud sound. For commercial projects requiring premium support, Picovoice Cobra offers comparable accuracy but requires a paid license and API key.

---

## Audio manipulation libraries for the cutting pipeline

After VAD identifies silence timestamps, you need libraries to actually cut the audio:

**ffmpeg.wasm** (16,900+ stars, MIT license) provides the most powerful option—full FFmpeg capabilities in the browser via WebAssembly. It handles cutting, splicing, and export to any format in a single library. The trade-off is a **2GB file size limit** and requiring SharedArrayBuffer headers.

```javascript
await ffmpeg.exec([
  '-i', 'input.mp3',
  '-af', `aselect='not(between(t,${silenceStart},${silenceEnd}))',asetpts=N/SR/TB`,
  'output.mp3'
]);
```

**wavesurfer.js** (10,000+ stars, actively maintained) excels at waveform visualization and region marking but explicitly states it cannot cut, add effects, or process audio. Use it for the visual editor interface, not the manipulation logic.

**Web Audio API native approaches** work for simpler cases—you can slice AudioBuffers directly and concatenate non-silent segments. Combine with **audiobuffer-to-wav** for WAV export or **lamejs** for MP3 encoding.

For an all-in-one React solution, **@waveform-playlist/browser** (v5 alpha) provides multi-track editing with trim boundaries, 20+ Tone.js effects, and WAV export built-in—though it's still in alpha status.

---

## Recommended architecture for auto-pause-removal

The optimal stack depends on expected file sizes:

**Files under 50MB** can be processed entirely client-side. Load the audio via AudioContext.decodeAudioData(), run @ricky0123/vad-web's NonRealTimeVAD in a Web Worker to avoid blocking the main thread, display detected regions in wavesurfer.js, then cut and export using ffmpeg.wasm.

**Files between 50-200MB** require chunked processing—analyze 30-second segments with 5-second overlaps, merge results, and process cuts in batches. Memory management becomes critical; release AudioBuffers promptly and use transferable objects when posting to Workers.

**Files exceeding 200MB** should be processed server-side. This is where tools like Descript transition to cloud processing—their architecture uses a "Media Transform Server" that transcodes large files into streamable chunks. Consider a hybrid approach: client-side preview with server-side export.

```
┌─────────────────────────────────────────────────────────┐
│           File Input → AudioContext.decodeAudioData()   │
│                              ↓                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Web Worker: @ricky0123/vad-web (NonRealTimeVAD)  │  │
│  │ Returns: [{start: 0, end: 2500}, {start: 3100...}] │  │
│  └───────────────────────────────────────────────────┘  │
│                              ↓                          │
│  wavesurfer.js: Display waveform + silence regions      │
│                              ↓                          │
│  ffmpeg.wasm: Cut audio at timestamps → Export MP3/WAV  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation guide with code patterns

### Step 1: Install dependencies

```bash
npm install @ricky0123/vad-web wavesurfer.js @ffmpeg/ffmpeg audiobuffer-to-wav
```

For React-specific hooks, also install `@ricky0123/vad-react`.

### Step 2: Set up VAD for uploaded files

```javascript
import { NonRealTimeVAD } from "@ricky0123/vad-web";

async function detectSilence(audioBuffer) {
  const vad = await NonRealTimeVAD.new({
    positiveSpeechThreshold: 0.5,    // Higher = more strict
    negativeSpeechThreshold: 0.35,
    redemptionMs: 500,                // Gap tolerance before marking silence
    preSpeechPadMs: 30,
    minSpeechMs: 250
  });

  // Convert to 16kHz mono (Silero requirement)
  const audioData = audioBuffer.getChannelData(0);
  const speechSegments = [];

  for await (const segment of vad.run(audioData, audioBuffer.sampleRate)) {
    speechSegments.push({
      start: segment.start / 1000,  // Convert ms to seconds
      end: segment.end / 1000
    });
  }
  return speechSegments;
}
```

### Step 3: Visualize with wavesurfer.js regions

```javascript
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  plugins: [RegionsPlugin.create()]
});

// Mark silence regions (inverse of speech segments)
function markSilenceRegions(speechSegments, duration) {
  let lastEnd = 0;
  speechSegments.forEach(({ start, end }) => {
    if (start > lastEnd) {
      wavesurfer.addRegion({
        start: lastEnd,
        end: start,
        color: 'rgba(255, 0, 0, 0.3)',  // Red = silence to remove
        drag: true,
        resize: true
      });
    }
    lastEnd = end;
  });
}
```

### Step 4: Cut and export with ffmpeg.wasm

```javascript
import { FFmpeg } from '@ffmpeg/ffmpeg';

async function removeSilence(inputFile, silenceRegions) {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  await ffmpeg.writeFile('input.mp3', await fetchFile(inputFile));

  // Build filter to select only non-silent parts
  const selectFilter = silenceRegions
    .map(r => `not(between(t,${r.start},${r.end}))`)
    .join('+');

  await ffmpeg.exec([
    '-i', 'input.mp3',
    '-af', `aselect='${selectFilter}',asetpts=N/SR/TB`,
    'output.mp3'
  ]);

  return await ffmpeg.readFile('output.mp3');
}
```

---

## Critical gotchas and edge cases

**Safari requires user gesture to start AudioContext.** The browser blocks audio processing until a click/tap event. Always create AudioContext inside an event handler and call `audioContext.resume()` if suspended. iOS Safari is particularly strict—some versions completely broke Web Audio API (fixed in later patches).

**SharedArrayBuffer headers are required for ffmpeg.wasm.** Your server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Without these, ffmpeg.wasm silently fails in Chrome.

**VBR MP3 files cause timestamp sync issues** with wavesurfer.js—the waveform may drift from actual playback position. Convert to CBR (constant bitrate) or WAV for reliable editing.

**Memory limits vary significantly by browser.** Chrome caps ArrayBuffer at ~2GB; Firefox 64-bit supports larger since version 89. For files approaching these limits, use streaming approaches with `response.body.getReader()` rather than loading entire files into memory.

**Mobile browsers have additional constraints**: lower memory limits, throttled background processing, and potential AudioWorklet unavailability (fallback to deprecated ScriptProcessorNode). Test thoroughly on iOS Safari and Android Chrome.

The @ricky0123/vad-web bundle size (~4MB) can impact initial load times. Consider lazy-loading the VAD module only when users begin editing, or use a CDN-hosted version of the ONNX model files.

---

## Conclusion

The path to building a ReactJS audio editor with auto-pause-removal is clear: **@ricky0123/vad-web** provides accurate, production-ready silence detection that energy-based alternatives cannot match. Pair it with **wavesurfer.js** for visualization and **ffmpeg.wasm** for manipulation to create a complete client-side solution for files under 200MB.

The key architectural insight is that Descript-style tools use hybrid processing—client-side for responsiveness, server-side for heavy lifting. Start client-only, add server processing as file size requirements grow. Offload VAD to Web Workers immediately to prevent UI blocking, and handle Safari's audio quirks by requiring user interaction before any AudioContext creation.

Avoid deprecated libraries like hark.js despite their smaller bundle sizes—the accuracy difference is substantial enough that users will notice false positives in real-world recordings with background noise.
