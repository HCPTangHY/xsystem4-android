package io.github.kichikuou.xsystem4

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

data class GameHistory(
    val playTimeMs: Long = 0,
    val lastPlayed: Long = 0,
    val pinned: Boolean = false,
)

/** SQLite keeps the launcher and the separate :game process on the same record. */
class GameLibraryStore(context: Context) :
    SQLiteOpenHelper(context.applicationContext, "game_library.db", null, 1) {
    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE games (
                path TEXT PRIMARY KEY NOT NULL,
                play_time_ms INTEGER NOT NULL DEFAULT 0,
                last_played INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0
            )
        """.trimIndent())
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun readAll(): Map<String, GameHistory> {
        val result = mutableMapOf<String, GameHistory>()
        readableDatabase.query("games", arrayOf("path", "play_time_ms", "last_played", "pinned"),
            null, null, null, null, null).use { cursor ->
            while (cursor.moveToNext()) {
                result[cursor.getString(0)] = GameHistory(
                    cursor.getLong(1), cursor.getLong(2), cursor.getInt(3) != 0)
            }
        }
        return result
    }

    private fun ensureGame(path: String) {
        writableDatabase.insertWithOnConflict("games", null,
            ContentValues().apply { put("path", path) }, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun markPlayed(path: String) {
        ensureGame(path)
        writableDatabase.update("games", ContentValues().apply {
            put("last_played", System.currentTimeMillis())
        }, "path = ?", arrayOf(path))
    }

    fun addPlayTime(path: String, elapsedMs: Long) {
        if (elapsedMs <= 0) return
        ensureGame(path)
        // An atomic increment cannot overwrite a pin change from the launcher.
        writableDatabase.execSQL(
            "UPDATE games SET play_time_ms = play_time_ms + ? WHERE path = ?",
            arrayOf<Any>(elapsedMs, path))
    }

    fun setPinned(path: String, pinned: Boolean) {
        ensureGame(path)
        writableDatabase.update("games", ContentValues().apply {
            put("pinned", if (pinned) 1 else 0)
        }, "path = ?", arrayOf(path))
    }

    fun remove(path: String) {
        writableDatabase.delete("games", "path = ?", arrayOf(path))
    }
}

/** Counts foreground wall time, independent of the game's speed setting. */
class GamePlaySession(context: Context, private val path: String) {
    private val store = GameLibraryStore(context)
    private val handler = Handler(Looper.getMainLooper())
    private var lastCheckpoint: Long? = null
    private val checkpoint = object : Runnable {
        override fun run() {
            if (lastCheckpoint == null) return
            flush()
            handler.postDelayed(this, 15_000L)
        }
    }

    fun resume() {
        if (lastCheckpoint != null) return
        store.markPlayed(path)
        lastCheckpoint = SystemClock.elapsedRealtime()
        handler.postDelayed(checkpoint, 15_000L)
    }

    private fun flush() {
        val previous = lastCheckpoint ?: return
        val now = SystemClock.elapsedRealtime()
        store.addPlayTime(path, (now - previous).coerceAtLeast(0))
        lastCheckpoint = now
    }

    fun pause() {
        handler.removeCallbacks(checkpoint)
        flush()
        lastCheckpoint = null
    }

    fun close() {
        pause()
        store.close()
    }
}
