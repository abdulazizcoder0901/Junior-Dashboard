---
name: ozbek-ovoz
description: Uzbek voiceover (ozvuchka) for videos with the open-source Navoiy TTS model, in a female (ayol) or male (erkak) voice with emotion presets. Use when the user asks for Uzbek narration, "ayol ovozida" / "erkak ovozida", or a voiceover for a montaj/reels video.
---

# O'zbekcha ovoz (Navoiy TTS)

1. If `$HOME/.cache/ozbek-ovoz/venv` is missing, run `bash .claude/skills/ozbek-ovoz/setup.sh` (~10 min, ~9 GB).
   It needs huggingface.co, *.huggingface.co and *.hf.co in the environment's allowed domains.
2. Write the script as JSON lines: `[{"id":"h1","text":"...","emotion":"happy"}]`.
   Emotions: calm, happy, surprised, warm, whispers, sad, angry, nervous, tired, sarcastic.
   Write numbers as digits or words; the normalizer spells digits out.
3. Run with the venv python:
   `~/.cache/ozbek-ovoz/venv/bin/python .claude/skills/ozbek-ovoz/ovoz.py --ovoz ayol lines.json out/`
   (`--ovoz erkak` for the male voice). One `<id>.wav` (24 kHz) per line plus `report.json`.
4. Check `report.json`: `wer` is how far the transcription of the kept take is from the script
   (0 = word-perfect; the local Uzbek Whisper itself misses ~1 word in 6, so up to ~0.15 is usually fine).
   Re-run lines with a higher `wer` with `--tries 5`, or reword them (very short lines come out worse).

CPU speed is about 4-8 s of compute per second of audio. Takes are checked with the local
rubaistt v2 medium Whisper model; Gemini (the `x-goog-api-key` network secret) is only a fallback.
The voices are cloned from the CosyVoice sample prompts; to use a real person's voice, get their consent
and a clean 10-20 s WAV, and add it to `VOICES` in ovoz.py.
