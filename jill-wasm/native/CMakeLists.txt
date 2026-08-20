cmake_minimum_required(VERSION 3.16)
project(jill_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(jill_core
    src/bytes.cpp
    src/rgba.cpp
    src/palette.cpp
    src/sha.cpp
    src/dma.cpp
    src/jn.cpp
    src/render.cpp
)
target_include_directories(jill_core PUBLIC include)

add_executable(dump_native src/dump_native.cpp)
target_link_libraries(dump_native PRIVATE jill_core)

add_executable(compare_rgba src/compare_rgba.cpp)
target_link_libraries(compare_rgba PRIVATE jill_core)

enable_testing()
add_executable(test_pixel_match tests/test_pixel_match.cpp)
target_link_libraries(test_pixel_match PRIVATE jill_core)
target_compile_definitions(test_pixel_match PRIVATE
    JILL_GAME_DIR="${CMAKE_SOURCE_DIR}/.."
    JILL_PALETTE="${CMAKE_SOURCE_DIR}/data/jill_color_map.properties"
    JILL_JAVA_GOLDENS="${CMAKE_SOURCE_DIR}/../goldens/java"
)
add_test(NAME pixel_match COMMAND test_pixel_match)
