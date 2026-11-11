if (NOT TARGET SDL2::SDL2)
  include(FetchContent)
  if (XSYS4_DEPS_DIR)
    # Offline build: see XSYS4_DEPS_DIR in the top-level CMakeLists.txt.
    FetchContent_Declare(
      SDL
      SOURCE_DIR "${XSYS4_DEPS_DIR}/src/SDL2-2.30.9"
    )
  else()
    FetchContent_Declare(
      SDL
      URL https://github.com/libsdl-org/SDL/releases/download/release-2.30.9/SDL2-2.30.9.tar.gz
      URL_HASH SHA1=9403df0573d47f62f2de074b582b87576bb4abbc
    )
  endif()
  FetchContent_MakeAvailable(SDL)
  install(TARGETS SDL2)
endif()
