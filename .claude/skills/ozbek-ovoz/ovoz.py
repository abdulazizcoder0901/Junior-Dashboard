#!/usr/bin/env python3
"""Uzbek voiceover with Navoiy TTS (CosyVoice2) on CPU, female or male voice.

Each line is synthesized up to --tries times with different seeds. Every take is transcribed
with a local Uzbek Whisper model (rubaistt v2 medium; Gemini is the fallback) and the take whose
words best match the script is kept, so mispronounced takes are dropped.

usage: ovoz.py --ovoz ayol|erkak lines.json OUT_DIR [--tries 3]
lines.json: [{"id": "h1", "text": "...", "emotion": "happy", "speed": 1.0}, ...]
emotions: calm happy sad angry nervous surprised whispers warm tired sarcastic
"""
import argparse, base64, json, os, random, re, sys, time, urllib.request
from pathlib import Path

HOME = Path(os.environ.get("TTS_HOME", Path.home() / ".cache/ozbek-ovoz"))
VOICES = {"ayol": HOME / "cv/asset/zero_shot_prompt.wav", "erkak": HOME / "cv/asset/cross_lingual_prompt.wav"}


def words(s):
    s = s.lower().replace("ʻ", "'").replace("‘", "'").replace("’", "'").replace("ʼ", "'")
    return re.findall(r"[a-z']+", s)


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


_ASR = []


def transcribe_local(wav):
    try:
        import torch, torchaudio
        from transformers import WhisperProcessor, WhisperForConditionalGeneration
        if not _ASR:
            d = str(HOME / "models/rubaistt")
            _ASR[:] = [WhisperProcessor.from_pretrained(d), WhisperForConditionalGeneration.from_pretrained(d).eval()]
        proc, asr = _ASR
        x, sr = torchaudio.load(str(wav))
        x = torchaudio.functional.resample(x.mean(0), sr, 16000)
        feats = proc(x.numpy(), sampling_rate=16000, return_tensors="pt").input_features
        with torch.inference_mode():
            ids = asr.generate(feats, language="uz", task="transcribe", max_new_tokens=200)
        return proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
    except Exception as e:
        print("local ASR failed:", e, file=sys.stderr)
        return None


def transcribe(wav):
    heard = transcribe_local(wav)
    if heard:
        return heard
    body = {"contents": [{"parts": [
        {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(Path(wav).read_bytes()).decode()}},
        {"text": "Transcribe this Uzbek audio exactly, word for word. Output only the transcription."}]}]}
    for model in ("gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest") * 3:
        try:
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            return r["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            time.sleep(8)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ovoz", choices=VOICES, default="ayol")
    ap.add_argument("--tries", type=int, default=3)
    ap.add_argument("lines"); ap.add_argument("out_dir")
    a = ap.parse_args()
    sys.path[:0] = [str(HOME / "cv"), str(HOME / "cv/third_party/Matcha-TTS"), str(HOME / "navoiy")]
    import torch, torchaudio
    from cosyvoice.cli.cosyvoice import CosyVoice2
    from uztts.normalize import normalize
    torch.set_num_threads(os.cpu_count() or 4)
    emo = {}
    for e in json.loads((HOME / "navoiy/emotions_40h.json").read_text()):
        emo[e["uz"].lower()] = e
        for t in e["tag"].replace("[", " ").replace("]", " ").split():
            emo[t.lower()] = e
    model = CosyVoice2(str(HOME / "models/CosyVoice2-0.5B"), load_jit=False, load_trt=False, fp16=False)
    state = torch.load(HOME / "models/navoiy/emotion_600h_joint.pt", map_location="cpu", weights_only=True)
    for k in ("state_dict", "model", "llm"):
        if isinstance(state, dict) and isinstance(state.get(k), dict):
            state = state[k]
    model.model.llm.load_state_dict(state, strict=False)
    model.model.llm.eval()
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    report = []
    for ln in json.loads(Path(a.lines).read_text()):
        instr = emo[ln.get("emotion", "calm").lower()]["instruct"].strip() + "<|endofprompt|>"
        best = None
        for k, seed in enumerate([7, 1986, 42, 2026, 11][: a.tries]):
            random.seed(seed); torch.manual_seed(seed)
            with torch.inference_mode():
                chunks = [r["tts_speech"].cpu() for r in model.inference_instruct2(
                    normalize(ln["text"], mode="infer"), instr, str(VOICES[a.ovoz]), stream=False, speed=ln.get("speed", 1.0))]
            take = out / f"{ln['id']}_take{k}.wav"
            torchaudio.save(str(take), torch.cat(chunks, dim=1), 24000)
            heard = transcribe(take)
            score = wer(ln["text"], heard) if heard else 1.0
            print(f"{ln['id']} seed={seed} wer={score:.2f} heard={heard!r}", flush=True)
            if best is None or score < best[0]:
                best = (score, take, heard)
            if heard is None or score == 0:
                break
        best[1].replace(out / f"{ln['id']}.wav")
        for t in out.glob(f"{ln['id']}_take*.wav"):
            t.unlink()
        report.append({"id": ln["id"], "wer": round(best[0], 3), "heard": best[2]})
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print("done:", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
