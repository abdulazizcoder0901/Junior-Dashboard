#!/usr/bin/env bash
# One-time install of Navoiy TTS + CosyVoice2 (CPU) into $TTS_HOME (~9 GB, ~10 min).
# Needs network access to huggingface.co, *.huggingface.co, *.hf.co and pypi; GitHub via the git proxy.
set -euo pipefail
H="${TTS_HOME:-$HOME/.cache/ozbek-ovoz}"; mkdir -p "$H"; cd "$H"
[ -d cv ] || git clone -q https://github.com/FunAudioLLM/CosyVoice.git cv
(cd cv && git fetch -q --depth 50 origin 074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc && git checkout -q 074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc && git submodule update -q --init --depth 1)
[ -d venv ] || uv venv -q -p python3.11 venv
. venv/bin/activate
uv pip install -q huggingface_hub==0.36.2 "setuptools<70" wheel cython
uv pip install -q --no-build-isolation openai-whisper==20231117 pyworld==0.3.4
uv pip install -q torch==2.3.1 torchaudio==2.3.1 numpy==1.26.4 transformers==4.51.3 conformer==0.3.2 \
  diffusers==0.29.0 HyperPyYAML==1.2.3 inflect==7.3.1 librosa==0.10.2 lightning==2.2.4 omegaconf==2.3.0 \
  hydra-core==1.3.2 onnxruntime==1.18.0 soundfile==0.12.1 x-transformers==2.11.24 wetext==0.0.4 \
  matplotlib==3.7.5 rich==13.7.1 gdown==5.1.0 wget==3.2 protobuf==4.25 pyarrow==18.1.0 networkx==3.1 modelscope==1.20.0
python - <<PY
from huggingface_hub import snapshot_download, hf_hub_download
snapshot_download("FunAudioLLM/CosyVoice2-0.5B", revision="eec1ae6c79877dbd9379285cf8789c9e0879293d", local_dir="$H/models/CosyVoice2-0.5B")
hf_hub_download("aisha-org/navoiy-tts", "emotion_600h_joint.pt", local_dir="$H/models/navoiy")
for f in ("emotions_40h.json", "uztts/__init__.py", "uztts/normalize.py"):
    hf_hub_download("aisha-org/navoiy-tts", f, local_dir="$H/navoiy")
PY
echo "ozbek-ovoz ready in $H"
