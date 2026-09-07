FROM emscripten/emsdk:4.0.17
WORKDIR /cs
COPY src .
RUN emcmake cmake -S . -B build -DMAINUI_USE_STB=ON \
      -DBUILD_CLIENT=OFF -DBUILD_SERVER=OFF \
      -DCMAKE_CXX_FLAGS=-fPIC -DCMAKE_C_FLAGS=-fPIC && \
    cmake --build build --config Release --target menu && \
    em++ -sSIDE_MODULE=1 -Oz -o menu_emscripten_wasm32.wasm \
      build/3rdparty/mainui_cpp/menu_emscripten_wasm32.a
