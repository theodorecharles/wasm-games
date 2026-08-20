#!/bin/sh
# Dump OpenJill VGA tiles + map backgrounds using the real Java loaders.
# Uses the JDK source-file launcher (no javac required).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
OUT="${2:-$ROOT/goldens/java}"
GAME="${1:-$ROOT}"
CP="$ROOT/openjill/sha-file/target/sha-file-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/sha-file-api/target/sha-file-api-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/dma-file/target/dma-file-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/dma-file-api/target/dma-file-api-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/jn-file/target/jn-file-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/jn-file-api/target/jn-file-api-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/abstractfile/target/abstractfile-0.2.7-SNAPSHOT.jar"
CP="$CP:$ROOT/openjill/abstractfile-api/target/abstractfile-api-0.2.7-SNAPSHOT.jar"
mkdir -p "$OUT"
exec java -Djava.awt.headless=true -cp "$CP" "$ROOT/tools/java-golden/DumpGoldens.java" "$GAME" "$OUT"
