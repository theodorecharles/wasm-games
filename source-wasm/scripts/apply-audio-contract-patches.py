#!/usr/bin/env python3
"""Keep SDL's callback format consistent with the engine's fixed PCM mixer."""
import json
import pathlib
import subprocess
import sys

args = sys.argv[1:]
check = args[:1] == ["--check"]
if check:
    args = args[1:]
if len(args) != 1:
    raise SystemExit("Usage: apply-audio-contract-patches.py [--check] PRIVATE_SOURCE_ROOT")
root = pathlib.Path(args[0]).resolve()
package = pathlib.Path(__file__).resolve().parent.parent
pin = json.loads((package / "side-module-reference.json").read_text())["sourceCommit"]
actual = subprocess.check_output(["git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if actual != pin:
    raise SystemExit("Wrong private source pin")
file = root / "engine/audio/snd_dev_sdl.cpp"
anchor = "\tm_devId = SDL_OpenAudioDevice(NULL, 0, &desired, &obtained, SDL_AUDIO_ALLOW_ANY_CHANGE);"
replacement = """#ifdef __EMSCRIPTEN__
\t// The engine always mixes 44100 Hz signed-16 stereo. Let SDL convert that
\t// callback stream to Web Audio's float format and native sample rate.
\tconst int allowedChanges = 0;
#else
\tconst int allowedChanges = SDL_AUDIO_ALLOW_ANY_CHANGE;
#endif
\tm_devId = SDL_OpenAudioDevice(NULL, 0, &desired, &obtained, allowedChanges);
#ifdef __EMSCRIPTEN__
\tif ( m_devId )
\t\tprintf( "[source-audio] callback requested=%dHz/0x%x/%uch obtained=%dHz/0x%x/%uch samples=%u conversion=SDL-managed\\n",
\t\t\tdesired.freq, unsigned(desired.format), unsigned(desired.channels),
\t\t\tobtained.freq, unsigned(obtained.format), unsigned(obtained.channels), unsigned(obtained.samples) );
#endif"""
text = file.read_text()
if text.count(replacement) == 1 and anchor not in text:
    print("SDL audio callback contract verified")
elif text.count(anchor) != 1 or replacement in text:
    raise SystemExit("Unknown SDL device-open context; refusing to patch")
elif check:
    raise SystemExit("SDL audio callback contract patch missing")
else:
    file.write_text(text.replace(anchor, replacement, 1))
    print("Restored fixed SDL audio callback contract")
