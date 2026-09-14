cmake_minimum_required(VERSION 3.20)

project(ClipHistory LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(ClipHistory
    src/main.cpp
    src/window.cpp
    src/database.cpp
)

target_include_directories(ClipHistory PRIVATE include)
target_compile_definitions(ClipHistory PRIVATE UNICODE _UNICODE)

# WebView2 (vcpkg)
target_include_directories(ClipHistory PRIVATE
    C:/vcpkg/installed/x64-windows/include
)

target_link_libraries(ClipHistory PRIVATE
    C:/vcpkg/installed/x64-windows/lib/WebView2Loader.dll.lib
    shlwapi
    version
)

# SQLite 3

find_package(unofficial-sqlite3 CONFIG REQUIRED)
target_link_libraries(ClipHistory PRIVATE
    unofficial::sqlite3::sqlite3
)