let meta = #{
    name: "openut-verify",
    description: "Compile the UT99 WASM factory, run tests, and start Docker",
    phases: [ #{ title: "Verify", detail: "execute tests compile docker" } ],
};

phase("Verify");
let prompt = "Work only in /home/ted/Development/wasm/openut-wasm. You MUST call run_terminal_command. ";
prompt += "1) cd /home/ted/Development/wasm/openut-wasm && npm test. Capture to /tmp/grok-goal-c613c1c70a9e/implementer/npm-test.log and adapter-contract.log. Fix failures. ";
prompt += "2) source /home/ted/emsdk/emsdk_env.sh and bash scripts/build-web.sh. Save to /tmp/grok-goal-c613c1c70a9e/implementer/build-web.log. ";
prompt += "3) WASM_GAME_FRAMEWORK_ROOT=/home/ted/Development/wasm/wasm-game-framework bash scripts/build-image.sh openut-wasm:dev. ";
prompt += "4) Run docker image twice on -p 8088:8088 with a data volume. Capture logs to docker-run-1.log and docker-run-2.log and HTTP to http-1/ http-2/. Write http://127.0.0.1:8088/ to url.txt in that scratch dir. ";
prompt += "Steam UT99 is at /home/ted/.steam/debian-installation/steamapps/common/Unreal Tournament. Validate if possible. Return the test URL and command outputs.";
let r = agent(prompt, #{ label: "verify", capability_mode: "execute" });
if r != () && r.success {
    complete(r.output);
}
complete("failed-verify");
