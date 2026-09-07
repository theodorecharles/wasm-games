# RTCW lightmap regression fixtures

The C prefix/main provide a small GL boundary around the complete `tr_es2.c`
reconstructed from patches 0017, 0018 and 0021. They check array enable masks,
matrix/vertex packing and draw batching; they are not a GPU image oracle.

`rtcw-legacy-draw-wrapper.js` is the exact generated `glDrawArrays` wrapper
from Emscripten 4.0.23 (`7a5d93b50f6a3a35e85a0d2fc9e667b8498e6aed`),
as shipped in `iowolfmp.js` with SHA-256
`f3972e914d66ffaf3506ddb0d15d21e61cf59a26a6bbb8f8cb85a1d1d5832a78`.
Its source is `src/lib/libglemu.js`. Passing a generated JS artifact to
`rtcw-lightmap-state.test.js` verifies byte equality with this fixture.
The wrapper is used under Emscripten's MIT license:

Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
