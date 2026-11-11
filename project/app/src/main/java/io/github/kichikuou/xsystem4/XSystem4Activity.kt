package io.github.kichikuou.xsystem4

import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.divider.MaterialDivider
import com.google.android.material.textfield.TextInputLayout
import com.google.android.material.textfield.TextInputEditText
import android.content.Context
import android.content.DialogInterface
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.PopupWindow
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import org.json.JSONObject
import org.libsdl.app.SDLActivity
import java.io.File
import kotlin.math.hypot

// Intent for this activity must have the following extras:
// - EXTRA_GAME_ROOT (string): A path to the game installation.
// - EXTRA_SAVE_DIR (string): A path to a directory where save files are stored.
class XSystem4Activity : SDLActivity() {
    companion object {
        const val EXTRA_GAME_ROOT = "GAME_ROOT"
        const val EXTRA_SAVE_DIR = "SAVE_DIR"
        const val COMMAND_OPEN_PLAYING_MANUAL = 0x8000  // xsystem4/src/hll/SystemService.c

        const val PREFS_NAME = "xsystem4"
        const val PREF_TOUCH_MODE = "touch_mode"
        const val PREF_ANIME4K = "anime4k"
        const val PREF_ANIME4K_SCALE = "anime4k_scale"
        const val PREF_GAME_SPEED = "game_speed"
        const val PREF_AUTO_MINS = "auto_save_minutes"
        const val PREF_AUTO_LOAD = "auto_load_latest"
    }

    enum class TouchMode {
        TOUCHPAD,  // Relative cursor movement, like a laptop touchpad.
        DIRECT,     // Touch directly maps to screen position.
    }

    enum class Anime4kScale(val label: String) {
        OFF("关闭"),
        X2("2x (M)"),
        X4("4x (M+S)"),
        CUNNY2_FAST_NVL("CuNNy2 2x（fast-NVL）"),
    }

    // 变速齿轮：percent = 100 为原速，> 100 加速，< 100 减速
    enum class GameSpeed(val label: String, val percent: Int) {
        X0_5("0.5x（慢放）", 50),
        X1("1x（原速）", 100),
        X2("2x", 200),
        X3("3x", 300),
        X4("4x", 400),
        X6("6x", 600),
    }

    private var cursorView: ElasticCursorView? = null
    private var playSession: GamePlaySession? = null

    private var touchMode = TouchMode.TOUCHPAD
    private var anime4kScale = Anime4kScale.X4
    private var gameSpeed = GameSpeed.X1

    // Implemented in xsystem4/src/anime4k.c (libxsystem4.so)
    private external fun nativeSetAnime4kMode(mode: Int)

    // Implemented in xsystem4/src/time_scale.c (libxsystem4.so)
    private external fun nativeSetGameSpeed(percent: Int)

    // Implemented in xsystem4/src/cheat.c (libxsystem4.so)
    private external fun nativeCheatCount(): Int
    private external fun nativeCheatList(offset: Int, limit: Int, filter: String?): String
    private external fun nativeCheatSet(index: Int, value: String): Boolean
    private external fun nativeCheatScan(value: String?, mode: Int): String
    private external fun nativeCheatResetScan()

    // 即时存档（实现在 xsystem4/src/quicksave.c）：10 手动 + 10 自动
    private external fun nativeQuickList(): String
    private external fun nativeQuickSaveTo(kind: Int, slot: Int): Int
    private external fun nativeQuickLoadFrom(kind: Int, slot: Int): Int
    private external fun nativeQuickDelete(kind: Int, slot: Int): Boolean
    private external fun nativeQuickSetInterval(seconds: Int)
    private external fun nativeQuickForceAuto()
    private external fun nativeQuickBusy(): Boolean
    private external fun nativeQuickVmReady(): Boolean
    private external fun nativeQuickLatest(): String
    private external fun nativeQuickSetAutoResume(on: Boolean)
    private external fun nativeQuickGetAutoResume(): Boolean

    private var cursorX = -1f
    private var cursorY = -1f
    private var touchDownX = 0f
    private var touchDownY = 0f
    private var lastTouchX = 0f
    private var lastTouchY = 0f
    private var touchDownTime = 0L
    private var maxPointers = 1
    private var hasMoved = false
    private var isDragging = false
    private var lastTwoFingerY = 0f
    private var twoFingerScrolled = false

    // Hold-and-tap right click state (touchpad mode)
    private var secondFingerId = -1
    private var secondFingerDownTime = 0L
    private var secondFingerDownX = 0f
    private var secondFingerDownY = 0f

    private val mainHandler = Handler(Looper.getMainLooper())
    private val longPressRunnable = Runnable {
        if (!hasMoved && maxPointers == 1) {
            isDragging = true
            cursorView?.dragging = true
            SDLActivity.onNativeMouse(1, MotionEvent.ACTION_DOWN, cursorX, cursorY, false)
        }
    }

    private var menuPopup: PopupWindow? = null
    private var popupRef: PopupWindow? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Workaround for https://github.com/libsdl-org/SDL/issues/8995
        SDLActivity.setWindowStyle(true)
        touchMode = try {
            TouchMode.valueOf(
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(PREF_TOUCH_MODE, TouchMode.TOUCHPAD.name)!!)
        } catch (e: IllegalArgumentException) {
            TouchMode.TOUCHPAD
        }
        anime4kScale = try {
            Anime4kScale.valueOf(
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(PREF_ANIME4K_SCALE, Anime4kScale.X4.name)!!)
        } catch (e: IllegalArgumentException) {
            Anime4kScale.X4
        }
        try {
            nativeSetAnime4kMode(anime4kScale.ordinal)
        } catch (e: UnsatisfiedLinkError) {
            // Library not loaded yet; the menu toggle applies it later.
        }
        val savedSpeed = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .getInt(PREF_GAME_SPEED, GameSpeed.X1.percent)
        gameSpeed = GameSpeed.values().firstOrNull { it.percent == savedSpeed } ?: GameSpeed.X1
        try {
            nativeSetGameSpeed(gameSpeed.percent)
        } catch (e: UnsatisfiedLinkError) {
            // Library not loaded yet; the menu toggle applies it later.
        }
        initVirtualCursor()
        intent.getStringExtra(EXTRA_GAME_ROOT)?.let {
            playSession = GamePlaySession(this, it)
        }
    }

    // ------------------------------------------------------------------
    // Virtual cursor
    // ------------------------------------------------------------------

    private fun initVirtualCursor() {
        try {
            cursorView = ElasticCursorView(this).apply {
                layoutParams = ViewGroup.LayoutParams(ElasticCursorView.VIEW_SIZE, ElasticCursorView.VIEW_SIZE)
                elevation = 9999f
                translationZ = 9999f
                x = 100f - ElasticCursorView.VIEW_SIZE / 2f
                y = 100f - ElasticCursorView.VIEW_SIZE / 2f
                visibility = if (touchMode == TouchMode.DIRECT) View.INVISIBLE else View.VISIBLE
            }
            val decorView = window.decorView as? ViewGroup
            if (decorView != null) {
                decorView.addView(cursorView)
            } else {
                mLayout?.addView(cursorView)
            }
            cursorView?.bringToFront()
            window.decorView.post {
                cursorView?.bringToFront()
            }
        } catch (e: Exception) {
            android.util.Log.e("XSystem4", "initVirtualCursor failed", e)
        }
    }

    private fun updateCursor(x: Float, y: Float) {
        // In direct mode the finger IS the pointer; no visible cursor.
        if (touchMode == TouchMode.DIRECT) {
            cursorView?.visibility = View.INVISIBLE
            return
        }
        cursorView?.visibility = View.VISIBLE
        cursorView?.apply {
            moveTo(x, y)
            bringToFront()
        }
    }

    private fun surfaceSize(): Pair<Float, Float> {
        val width = mSurface?.width?.toFloat() ?: resources.displayMetrics.widthPixels.toFloat()
        val height = mSurface?.height?.toFloat() ?: resources.displayMetrics.heightPixels.toFloat()
        return Pair(width, height)
    }

    private fun sendClick(button: Int) {
        cursorView?.showClickFeedback(button)
        SDLActivity.onNativeMouse(button, MotionEvent.ACTION_DOWN, cursorX, cursorY, false)
        cursorView?.postDelayed({
            SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
        }, 40L)
    }

    // ------------------------------------------------------------------
    // Touch dispatch
    // ------------------------------------------------------------------

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.source == InputDevice.SOURCE_MOUSE ||
            event.source == (InputDevice.SOURCE_MOUSE or InputDevice.SOURCE_TOUCHSCREEN)) {
            return super.dispatchTouchEvent(event)
        }

        return if (touchMode == TouchMode.DIRECT) {
            handleDirectTouch(event)
        } else {
            handleTouchpadTouch(event)
        }
    }

    private fun initCursorIfNeeded(width: Float, height: Float) {
        if (cursorX < 0f) {
            cursorX = width / 2f
            cursorY = height / 2f
            updateCursor(cursorX, cursorY)
            SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)
        }
    }

    /** Touchpad mode: relative cursor movement. */
    private fun handleTouchpadTouch(event: MotionEvent): Boolean {
        val action = event.actionMasked
        val pointerCount = event.pointerCount
        val (width, height) = surfaceSize()

        initCursorIfNeeded(width, height)

        when (action) {
            MotionEvent.ACTION_DOWN -> {
                touchDownX = event.x
                touchDownY = event.y
                lastTouchX = touchDownX
                lastTouchY = touchDownY
                touchDownTime = System.currentTimeMillis()
                maxPointers = 1
                hasMoved = false
                isDragging = false
                secondFingerId = -1
                mainHandler.removeCallbacks(longPressRunnable)
                cursorView?.dragging = false
                mainHandler.postDelayed(longPressRunnable, 350L)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                mainHandler.removeCallbacks(longPressRunnable)
                if (pointerCount > maxPointers) {
                    maxPointers = pointerCount
                }
                if (pointerCount == 2) {
                    lastTwoFingerY = (event.getY(0) + event.getY(1)) / 2f
                    val idx = event.actionIndex
                    secondFingerId = event.getPointerId(idx)
                    secondFingerDownTime = System.currentTimeMillis()
                    secondFingerDownX = event.getX(idx)
                    secondFingerDownY = event.getY(idx)
                    twoFingerScrolled = false
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (pointerCount > maxPointers) {
                    maxPointers = pointerCount
                }
                if (pointerCount == 1) {
                    val curX = event.x
                    val curY = event.y
                    val dx = curX - lastTouchX
                    val dy = curY - lastTouchY
                    lastTouchX = curX
                    lastTouchY = curY

                    val dist = hypot((curX - touchDownX).toDouble(), (curY - touchDownY).toDouble()).toFloat()
                    if (dist > 14f) {
                        hasMoved = true
                        if (!isDragging) {
                            mainHandler.removeCallbacks(longPressRunnable)
                        }
                    }

                    val sensitivity = 1.3f
                    cursorX = (cursorX + dx * sensitivity).coerceIn(0f, width)
                    cursorY = (cursorY + dy * sensitivity).coerceIn(0f, height)
                    updateCursor(cursorX, cursorY)

                    // Always keep mouse position synchronized for hover inspection
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)

                    if (isDragging) {
                        SDLActivity.onNativeMouse(1, MotionEvent.ACTION_MOVE, cursorX, cursorY, false)
                    }
                } else if (pointerCount == 2) {
                    val midY = (event.getY(0) + event.getY(1)) / 2f
                    val dy = midY - lastTwoFingerY
                    val scrollThreshold = 25f
                    if (Math.abs(dy) >= scrollThreshold) {
                        val scrollDir = if (dy > 0) 1f else -1f
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_SCROLL, 0f, scrollDir, false)
                        lastTwoFingerY = midY
                        twoFingerScrolled = true
                    }
                    // Track the second finger's own movement.
                    val idx = event.findPointerIndex(secondFingerId)
                    if (idx >= 0) {
                        val d2 = hypot(
                            (event.getX(idx) - secondFingerDownX).toDouble(),
                            (event.getY(idx) - secondFingerDownY).toDouble()
                        ).toFloat()
                        if (d2 > 30f) {
                            // Big movement of the second finger: treat as scroll-ish, not a tap.
                            twoFingerScrolled = true
                        }
                    }
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                mainHandler.removeCallbacks(longPressRunnable)
                if (pointerCount == 2 && secondFingerId >= 0) {
                    // Hold one finger + tap with another = right click.
                    // This also covers the classic two-finger simultaneous tap.
                    val dur = System.currentTimeMillis() - secondFingerDownTime
                    val idx = event.findPointerIndex(secondFingerId)
                    val secondFingerMoved = if (idx >= 0) {
                        hypot(
                            (event.getX(idx) - secondFingerDownX).toDouble(),
                            (event.getY(idx) - secondFingerDownY).toDouble()
                        ).toFloat() > 30f
                    } else {
                        false
                    }
                    if (!twoFingerScrolled && !secondFingerMoved && dur < 500L) {
                        sendClick(2)
                    }
                    secondFingerId = -1
                }
            }
            MotionEvent.ACTION_UP -> {
                mainHandler.removeCallbacks(longPressRunnable)
                val duration = System.currentTimeMillis() - touchDownTime
                val dist = hypot((event.x - touchDownX).toDouble(), (event.y - touchDownY).toDouble()).toFloat()

                if (isDragging) {
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                    isDragging = false
                    cursorView?.dragging = false
                } else if (maxPointers == 1 && !hasMoved && dist < 14f && duration < 320L) {
                    // Strictly stationary tap = Click (Mouse only, no duplicate touch event)
                    sendClick(1)
                }

                // Continuously re-latch hover coordinates after touch release so tooltip stays up
                SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)
                maxPointers = 1
                hasMoved = false
                secondFingerId = -1
                cursorView?.relax()
            }
            MotionEvent.ACTION_CANCEL -> {
                mainHandler.removeCallbacks(longPressRunnable)
                if (isDragging) {
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                }
                isDragging = false
                maxPointers = 1
                hasMoved = false
                secondFingerId = -1
                cursorView?.dragging = false
                cursorView?.relax()
            }
        }
        return true
    }

    /** Direct touch mode: touch position maps directly to the screen. */
    private fun handleDirectTouch(event: MotionEvent): Boolean {
        val action = event.actionMasked
        val pointerCount = event.pointerCount
        val (width, height) = surfaceSize()

        initCursorIfNeeded(width, height)

        when (action) {
            MotionEvent.ACTION_DOWN -> {
                touchDownX = event.x
                touchDownY = event.y
                lastTouchX = touchDownX
                lastTouchY = touchDownY
                touchDownTime = System.currentTimeMillis()
                maxPointers = 1
                hasMoved = false
                isDragging = false
                twoFingerScrolled = false
                cursorX = event.x.coerceIn(0f, width)
                cursorY = event.y.coerceIn(0f, height)
                updateCursor(cursorX, cursorY)
                SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (pointerCount > maxPointers) {
                    maxPointers = pointerCount
                }
                if (pointerCount == 2) {
                    lastTwoFingerY = (event.getY(0) + event.getY(1)) / 2f
                    val idx = event.actionIndex
                    secondFingerId = event.getPointerId(idx)
                    secondFingerDownTime = System.currentTimeMillis()
                    secondFingerDownX = event.getX(idx)
                    secondFingerDownY = event.getY(idx)
                    twoFingerScrolled = false
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (pointerCount > maxPointers) {
                    maxPointers = pointerCount
                }
                if (pointerCount == 1) {
                    val curX = event.x
                    val curY = event.y
                    val dist = hypot((curX - touchDownX).toDouble(), (curY - touchDownY).toDouble()).toFloat()
                    cursorX = curX.coerceIn(0f, width)
                    cursorY = curY.coerceIn(0f, height)
                    if (dist > 14f) {
                        hasMoved = true
                        // Moving while pressed = drag (Rance games need this a lot).
                        if (!isDragging && maxPointers == 1 && !twoFingerScrolled) {
                            isDragging = true
                            SDLActivity.onNativeMouse(1, MotionEvent.ACTION_DOWN, cursorX, cursorY, false)
                        }
                    }
                    updateCursor(cursorX, cursorY)
                    if (isDragging) {
                        SDLActivity.onNativeMouse(1, MotionEvent.ACTION_MOVE, cursorX, cursorY, false)
                    } else {
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)
                    }
                } else if (pointerCount == 2) {
                    // Cursor keeps following the FIRST finger.
                    cursorX = event.getX(0).coerceIn(0f, width)
                    cursorY = event.getY(0).coerceIn(0f, height)
                    updateCursor(cursorX, cursorY)
                    if (isDragging) {
                        SDLActivity.onNativeMouse(1, MotionEvent.ACTION_MOVE, cursorX, cursorY, false)
                    }

                    val midY = (event.getY(0) + event.getY(1)) / 2f
                    val dy = midY - lastTwoFingerY
                    if (Math.abs(dy) >= 25f) {
                        val scrollDir = if (dy > 0) 1f else -1f
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_SCROLL, 0f, scrollDir, false)
                        lastTwoFingerY = midY
                        twoFingerScrolled = true
                        hasMoved = true
                    }
                    val idx = event.findPointerIndex(secondFingerId)
                    if (idx >= 0) {
                        val d2 = hypot(
                            (event.getX(idx) - secondFingerDownX).toDouble(),
                            (event.getY(idx) - secondFingerDownY).toDouble()
                        ).toFloat()
                        if (d2 > 30f) {
                            twoFingerScrolled = true
                        }
                    }
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                if (isDragging) {
                    // The finger holding the drag went away: end the drag.
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                    isDragging = false
                }
                if (pointerCount == 2 && secondFingerId >= 0) {
                    // Hold one finger + tap with another = right click,
                    // at the first finger's (cursor) position.
                    val dur = System.currentTimeMillis() - secondFingerDownTime
                    val idx = event.findPointerIndex(secondFingerId)
                    val secondFingerMoved = if (idx >= 0) {
                        hypot(
                            (event.getX(idx) - secondFingerDownX).toDouble(),
                            (event.getY(idx) - secondFingerDownY).toDouble()
                        ).toFloat() > 30f
                    } else {
                        false
                    }
                    if (!twoFingerScrolled && !secondFingerMoved && dur < 500L) {
                        sendClick(2)
                    }
                    secondFingerId = -1
                }
            }
            MotionEvent.ACTION_UP -> {
                val duration = System.currentTimeMillis() - touchDownTime
                val dist = hypot((event.x - touchDownX).toDouble(), (event.y - touchDownY).toDouble()).toFloat()

                if (isDragging) {
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                    isDragging = false
                } else if (maxPointers == 1 && !hasMoved &&
                    dist < 14f && duration < 320L) {
                    sendClick(1)
                }

                SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)
                maxPointers = 1
                hasMoved = false
            }
        }
        return true
    }

    // ------------------------------------------------------------------
    // Back key menu
    // ------------------------------------------------------------------

    override fun dispatchKeyEvent(ev: KeyEvent): Boolean {
        if (ev.keyCode == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_DOWN) {
            toggleMenu()
            return true
        }
        return super.dispatchKeyEvent(ev)
    }

    private fun toggleMenu() {
        if (menuPopup?.isShowing == true) {
            menuPopup?.dismiss()
            return
        }
        fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(12), dp(12), dp(16))
            background = Md3Ui.surface(this@XSystem4Activity,
                com.google.android.material.R.attr.colorSurfaceContainerLow, 16)
            isClickable = true
        }
        content.addView(Md3Ui.header(this, "游戏设置", "关闭菜单") { menuPopup?.dismiss() }.apply {
            setPadding(dp(16), 0, 0, dp(4))
        })
        fun row(label: String, value: String, action: () -> Unit) {
            content.addView(Md3Ui.listItem(this, label, value, action), LinearLayout.LayoutParams(-1, -2))
        }
        fun select(title: String, options: Array<String>, selected: Int, action: (Int) -> Unit) {
            menuPopup?.dismiss()
            MaterialAlertDialogBuilder(this).setTitle(title)
                .setSingleChoiceItems(options, selected) { dialog, which ->
                    action(which)
                    dialog.dismiss()
                }.setNegativeButton("取消", null).show()
        }
        content.addView(Md3Ui.section(this, "控制"))
        row("输入方式", if (touchMode == TouchMode.TOUCHPAD) "触摸板" else "直接触控") {
            select("输入方式", arrayOf("触摸板：滑动移动光标", "直接触控：点按画面位置"),
                if (touchMode == TouchMode.TOUCHPAD) 0 else 1) {
                setTouchMode(if (it == 0) TouchMode.TOUCHPAD else TouchMode.DIRECT)
            }
        }
        content.addView(Md3Ui.section(this, "画面与运行"))
        fun scaleLabel(scale: Anime4kScale) = if (scale == Anime4kScale.OFF || scale == Anime4kScale.CUNNY2_FAST_NVL) scale.label else "Anime4K ${scale.label}"
        row("画面增强", scaleLabel(anime4kScale)) {
            val modes = Anime4kScale.values()
            select("画面增强", modes.map { scaleLabel(it) }.toTypedArray(), anime4kScale.ordinal) {
                anime4kScale = modes[it]
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(PREF_ANIME4K_SCALE, anime4kScale.name).apply()
                try { nativeSetAnime4kMode(it) } catch (_: UnsatisfiedLinkError) { }
            }
        }
        row("游戏速度", gameSpeed.label) {
            val speeds = GameSpeed.values()
            select("游戏速度", speeds.map { it.label }.toTypedArray(), gameSpeed.ordinal) {
                gameSpeed = speeds[it]
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putInt(PREF_GAME_SPEED, gameSpeed.percent).apply()
                try { nativeSetGameSpeed(gameSpeed.percent) } catch (_: UnsatisfiedLinkError) { }
            }
        }
        content.addView(Md3Ui.section(this, "工具"))
        row("修改器", "搜索与修改数值") { openCheatPanel() }
        content.addView(Md3Ui.tonalButton(this, "退出游戏") {
            menuPopup?.dismiss()
            MaterialAlertDialogBuilder(this).setTitle("退出游戏？")
                .setMessage("未保存的进度将会丢失。")
                .setNegativeButton("取消", null)
                .setPositiveButton("退出") { _, _ -> finish() }
                .show()
        }, LinearLayout.LayoutParams(-1, -2).apply {
            topMargin = dp(24); leftMargin = dp(16); rightMargin = dp(16)
        })
        val scroll = ScrollView(this).apply {
            addView(content)
            isFillViewport = true
        }
        // MD3 scrim: the theme's scrim color at 32% opacity.
        val scrim = View(this).apply { setBackgroundColor(0x52000000) }
        val root = FrameLayout(this).apply {
            setOnClickListener { menuPopup?.dismiss() }
        }
        root.addView(scrim, FrameLayout.LayoutParams(-1, -1))
        root.addView(scroll, FrameLayout.LayoutParams(
            minOf(dp(360), resources.displayMetrics.widthPixels - dp(32)), -1, Gravity.START).apply {
                setMargins(dp(16), dp(16), dp(16), dp(16))
            })
        val popup = Md3Ui.sideSheet(this, root, scroll, scrim)
        popup.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        popup.isOutsideTouchable = true
        popup.setOnDismissListener { if (menuPopup === popup) menuPopup = null }
        menuPopup = popup
        popup.showAtLocation(window.decorView, Gravity.TOP or Gravity.START, 0, 0)
    }

    private fun setTouchMode(mode: TouchMode) {
        touchMode = mode
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(PREF_TOUCH_MODE, mode.name)
            .apply()
        menuPopup?.dismiss()
        updateCursor(cursorX, cursorY)
        val name = if (mode == TouchMode.TOUCHPAD) "触摸板模式" else "触控模式"
        Md3Ui.snackbar(findViewById(android.R.id.content), "已切换：$name")
    }

    // ------------------------------------------------------------------
    // Misc
    // ------------------------------------------------------------------

    override fun getLibraries(): Array<String> {
        return arrayOf("SDL2", "xsystem4")
    }

    override fun getArguments(): Array<String> {
        val saveFolder = intent.getStringExtra(EXTRA_SAVE_DIR)!!
        val gameRoot = intent.getStringExtra(EXTRA_GAME_ROOT)!!
        return arrayOf("--save-folder", saveFolder, "--save-format=rsm", gameRoot)
    }

    override fun onResume() {
        super.onResume()
        if (!isFinishing) playSession?.resume()
    }

    override fun onPause() {
        playSession?.pause()
        cursorView?.resetMotion()
        super.onPause()
    }

    override fun onDestroy() {
        playSession?.close()
        playSession = null
        mainHandler.removeCallbacksAndMessages(null)
        try {
            // Let SDL stop and join its native thread before terminating the game process.
            super.onDestroy()
        } finally {
            Process.killProcess(Process.myPid())
        }
    }

    private data class CheatRow(
        val index: Int, val name: String, val type: String,
        val value: String, val editable: Boolean,
    )
    // ------------------------------------------------------------------
    // 修改器面板：读写 AIN 全局变量（实现在 xsystem4/src/cheat.c）
    // ------------------------------------------------------------------

    private fun openCheatPanel() {
        menuPopup?.dismiss()
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)

        fun rippleBg() = RippleDrawable(
            ColorStateList.valueOf((Md3Ui.color(this, R.color.md3_on_surface) and 0x00ffffff) or 0x33000000), ColorDrawable(Color.TRANSPARENT), null
        ).constantState?.newDrawable()
        fun wrap() = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            // MD3 dialog: surfaceContainerHigh, extra-large (28dp) corners, no shadow.
            background = Md3Ui.surface(this@XSystem4Activity,
                com.google.android.material.R.attr.colorSurfaceContainerHigh, 28)
            isClickable = true
            setPadding(dp(24), dp(24), dp(24), dp(8))
        }
        val listBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            addView(listBox, ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val input = TextInputEditText(this).apply {
            textSize = 15f
            setSingleLine()
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or
                InputType.TYPE_NUMBER_FLAG_SIGNED
            setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface))

        }
        val status = TextView(this).apply {
            textSize = 14f
            setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface_variant))
            setPadding(dp(2), dp(12), dp(2), dp(6))
        }

        fun header(text: String, back: Boolean = false, onClose: () -> Unit) =
            Md3Ui.header(this, text, if (back) "返回" else "关闭",
                if (back) R.drawable.ic_arrow_back_24 else R.drawable.ic_close_24, onClose)

        fun button(label: String, primary: Boolean, onClick: () -> Unit): TextView =
            Md3Ui.button(this, label, primary, onClick)
        fun outlined(label: String, placeholder: String? = null) =
            TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle).apply {
                hint = label
                placeholderText = placeholder
            }
        fun chip(label: String, onClick: () -> Unit) =
            Chip(this, null, com.google.android.material.R.attr.chipStyle).apply {
                text = label
                setOnClickListener { onClick() }
            }


        var hasScanned = false
        // 这三个互相引用，局部函数只能前向引用，所以声明成变量
        var renderRowsFn: (String) -> Unit = {}
        var showEditorFn: (CheatRow) -> Unit = {}
        var buildMainFn: () -> Unit = {}

        renderRowsFn = fn@{ json ->
            listBox.removeAllViews()
            var count = 0
            var shown = 0
            try {
                val o = JSONObject(json)
                if (!o.optBoolean("ok")) {
                    status.text = o.optString("error", "失败了")
                    return@fn
                }
                count = o.optInt("count")
                shown = o.optInt("shown")
                hasScanned = o.optBoolean("started")
                val arr = o.optJSONArray("items")
                if (arr != null) {
                    for (n in 0 until arr.length()) {
                        val it = arr.getJSONObject(n)
                        val row = CheatRow(it.optInt("i"), it.optString("name"),
                            it.optString("type"), it.optString("value"),
                            it.optBoolean("editable"))
                        val rowView = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            background = rippleBg()
                            isClickable = true
                            setOnClickListener { showEditorFn(row) }
                        }
                        rowView.addView(TextView(this).apply {
                            text = row.name
                            textSize = 15f
                            typeface = medium
                            setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface))
                            setPadding(dp(4), dp(10), dp(4), 0)
                        }, wrap())
                        rowView.addView(TextView(this).apply {
                            text = row.value + "      " + row.type
                            textSize = 14f
                            setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface_variant))
                            setPadding(dp(10), dp(2), dp(10), dp(10))
                        }, wrap())
                        listBox.addView(rowView, wrap())
                        listBox.addView(MaterialDivider(this), wrap())
                    }
                }
            } catch (ex: Exception) {
                status.text = "解析失败：" + ex.message
                return@fn
            }
            status.text = when {
                !hasScanned -> "在游戏里看一眼数值，填进来点「搜索」"
                count == 0 -> "没有候选了 —— 可能改过头，点「重新开始」再来一遍"
                else -> "候选 " + count + " 个" +
                    (if (shown < count) "（只列出前 " + shown + " 个）" else "")
            }
        }

        fun callScan(value: String?, mode: Int) {
            val json = try {
                nativeCheatScan(value, mode)
            } catch (e: UnsatisfiedLinkError) {
                "{\"ok\":false,\"error\":\"原生库未加载\"}"
            }
            renderRowsFn(json)
        }

        showEditorFn = { row ->
            card.removeAllViews()
            card.addView(header("修改数值", back = true) { buildMainFn() }, wrap())
            card.addView(TextView(this).apply {
                text = row.name
                textSize = 15f
                setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface))
                setPadding(dp(2), dp(16), dp(2), dp(2))
            }, wrap())
            card.addView(TextView(this).apply {
                text = row.type + "    当前值 " + row.value
                textSize = 14f
                setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface_variant))
                setPadding(dp(2), dp(4), dp(2), dp(12))
            }, wrap())
            val edit = TextInputEditText(this).apply {
                setText(row.value)
                textSize = 16f
                setSingleLine()
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or
                    InputType.TYPE_NUMBER_FLAG_SIGNED
                setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface))
                setSelection(text?.length ?: 0)
            }
            card.addView(outlined("新数值").apply { addView(edit) }, wrap())
            val btns = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.END
                setPadding(0, dp(18), 0, 0)
            }
            btns.addView(button("返回", false) { buildMainFn() })
            btns.addView(button("写入", true) {
                val ok = try {
                    nativeCheatSet(row.index, edit.text.toString())
                } catch (e: UnsatisfiedLinkError) {
                    false
                }
                Md3Ui.snackbar(card, if (ok) "已写入" else "写入失败（不是合法数字）")
                callScan(null, 6)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(10) })
            card.addView(btns, wrap())
        }

        buildMainFn = {
            for (view in listOf(input, status, scroll)) (view.parent as? ViewGroup)?.removeView(view)
            card.removeAllViews()
            card.addView(header("修改器 · 数值搜索") { popupRef?.dismiss() }, wrap())
            card.addView(TextView(this).apply {
                text = "1) 在游戏里看一眼要改的数值（如金钱）\n" +
                    "2) 填进来点「搜索」\n" +
                    "3) 回游戏让数值变一下，再回来点「搜索」缩小范围，重复几次\n" +
                    "4) 候选剩几个时点进去改值"
                textSize = 14f
                setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface_variant))
                setPadding(dp(2), dp(10), dp(2), dp(10))
            }, wrap())

            val row1 = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            row1.addView(outlined("当前数值", "例如 12345").apply { addView(input) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row1.addView(button(if (hasScanned) "再次搜索" else "搜索", true) {
                callScan(input.text.toString(), if (hasScanned) 1 else 0)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(10) })
            card.addView(row1, wrap().apply { topMargin = dp(4) })

            card.addView(TextView(this).apply {
                text = "不想输数值时，用这些按「变化」筛："
                textSize = 12f
                setTextColor(Md3Ui.color(this@XSystem4Activity, R.color.md3_on_surface_variant))
                setPadding(dp(2), dp(14), dp(2), dp(6))
            }, wrap())
            val row2 = ChipGroup(this).apply {
                isSingleLine = false
                chipSpacingHorizontal = dp(8)
            }
            row2.addView(chip("值变化了") { callScan(null, 2) })
            row2.addView(chip("值没变") { callScan(null, 3) })
            row2.addView(chip("增加了") { callScan(null, 4) })
            row2.addView(chip("减少了") { callScan(null, 5) })
            card.addView(row2, wrap())

            card.addView(status, wrap())
            card.addView(scroll, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (resources.displayMetrics.heightPixels * 0.42f).toInt()))

            val bottom = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.END
                setPadding(0, dp(12), 0, 0)
            }
            bottom.addView(button("重新开始", false) {
                try {
                    nativeCheatResetScan()
                } catch (e: UnsatisfiedLinkError) {
                }
                input.setText("")
                callScan(null, 6)
            })
            card.addView(bottom, wrap())
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(0x52000000)
            setOnClickListener { popupRef?.dismiss() }
        }
        val box = ScrollView(this).apply {
            setPadding(dp(16), dp(16), dp(16), dp(16))
            isFillViewport = false
            addView(card, ViewGroup.LayoutParams(-1, -2))
        }
        root.addView(box, FrameLayout.LayoutParams(
            minOf(dp(640), resources.displayMetrics.widthPixels), FrameLayout.LayoutParams.MATCH_PARENT,
            Gravity.CENTER))

        val popup = PopupWindow(root, ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT, true)
        popupRef = popup
        popup.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        popup.isOutsideTouchable = true
        popup.setOnDismissListener { popupRef = null }
        buildMainFn()
        callScan(null, 6)
        popup.showAtLocation(window.decorView, Gravity.TOP or Gravity.START, 0, 0)
    }
    /**
     * SDL message boxes (exit confirmation, game errors) as Material 3 dialogs.
     * The Return-key default becomes the confirming action and the Escape-key
     * default the dismissive one, matching dialog button placement.
     */
    override fun messageboxCreateAndShow(args: Bundle) {
        val flags = args.getInt("flags")
        val title = args.getString("title").orEmpty()
        val buttonFlags = args.getIntArray("buttonFlags") ?: IntArray(0)
        val buttonIds = args.getIntArray("buttonIds") ?: IntArray(0)
        val buttonTexts = args.getStringArray("buttonTexts") ?: emptyArray()
        val builder = MaterialAlertDialogBuilder(this)
            .setMessage(args.getString("message"))
            .setCancelable(false)
        when {
            title.isNotEmpty() && !title.equals("xsystem4", ignoreCase = true) -> builder.setTitle(title)
            flags and 0x10 != 0 -> builder.setTitle("错误")
            flags and 0x20 != 0 -> builder.setTitle("警告")
        }
        fun choose(id: Int) = DialogInterface.OnClickListener { _, _ -> messageboxSelection[0] = id }
        var positive = buttonFlags.indexOfFirst { it and 0x1 != 0 }
        var negative = buttonFlags.indexOfFirst { it and 0x2 != 0 }
        if (positive < 0 && buttonTexts.size == 1) positive = 0
        if (positive < 0) positive = buttonTexts.indices.firstOrNull { it != negative } ?: -1
        if (negative == positive) negative = -1
        for (i in buttonTexts.indices) {
            when (i) {
                positive -> builder.setPositiveButton(buttonTexts[i], choose(buttonIds[i]))
                negative -> builder.setNegativeButton(buttonTexts[i], choose(buttonIds[i]))
                else -> builder.setNeutralButton(buttonTexts[i], choose(buttonIds[i]))
            }
        }
        if (buttonTexts.isEmpty()) builder.setPositiveButton("确定", null)
        val dialog = builder.create()
        dialog.setOnDismissListener {
            synchronized(messageboxSelection) { (messageboxSelection as java.lang.Object).notify() }
        }
        dialog.setOnKeyListener { d, keyCode, event ->
            if (event.action == KeyEvent.ACTION_UP && negative >= 0 &&
                (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE)) {
                messageboxSelection[0] = buttonIds[negative]
                d.dismiss()
                true
            } else false
        }
        dialog.show()
    }

    override fun onUnhandledMessage(command: Int, param: Any): Boolean {
        when (command) {
            COMMAND_OPEN_PLAYING_MANUAL -> {
                val gameRoot = intent.getStringExtra(EXTRA_GAME_ROOT)!!
                val manualDir = File(gameRoot, "Manual")
                if (manualDir.isDirectory) {
                    val intent = Intent(this, ManualActivity::class.java).apply {
                        val url = "file://${manualDir.absolutePath}/index.html"
                        putExtra(ManualActivity.EXTRA_URL, url)
                    }
                    startActivity(intent)
                }
                return true
            }
        }
        return super.onUnhandledMessage(command, param)
    }
}
