ARG FRAMEWORK_IMAGE=wasm-game-framework:0.9.4
FROM ${FRAMEWORK_IMAGE}

COPY game-site/ /opt/game-site/
COPY quakejs/ioq3ded.js /opt/quakejs/ioq3ded.js
COPY q3-server/ /opt/q3-server/
COPY q3-framework/lifecycle.js /opt/q3-framework/lifecycle.js

RUN cd /opt/q3-server && npm install --omit=dev --ignore-scripts && \
    mkdir -p /opt/q3-runtime-root/runtime && \
    node -e "if (require('/opt/wasm-game-framework/package.json').version !== '0.9.4') process.exit(1)"

ENV WASM_GAME_VARIANT=quake3 \
    WASM_GAME_HTTP_PORT=8088 \
    KEEP_ALIVE=false \
    IDLE_TIMEOUT=5m \
    MAP_ROTATION=q3dm6,q3dm7,q3dm11,q3dm17

EXPOSE 8088
ENTRYPOINT ["node", "/opt/q3-server/supervisor.js"]
