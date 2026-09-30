package io.github.kichikuou.xsystem4

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.Bundle
import android.os.Process
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.ImageView
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
    }

    private var cursorView: ImageView? = null
    private var cursorX = -1f
    private var cursorY = -1f
    private var touchDownX = 0f
    private var touchDownY = 0f
    private var lastTouchX = 0f
    private var lastTouchY = 0f
    private var touchDownTime = 0L
    private var maxPointers = 1
    private var isDragging = false
    private var lastTwoFingerY = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Workaround for https://github.com/libsdl-org/SDL/issues/8995
        SDLActivity.setWindowStyle(true)
        initVirtualCursor()
    }

    private fun initVirtualCursor() {
        try {
            val size = 48
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)

            val path = Path().apply {
                moveTo(0f, 0f)
                lineTo(0f, 36f)
                lineTo(10f, 26f)
                lineTo(18f, 42f)
                lineTo(24f, 38f)
                lineTo(16f, 22f)
                lineTo(28f, 22f)
                close()
            }

            paint.style = Paint.Style.FILL
            paint.color = Color.WHITE
            canvas.drawPath(path, paint)

            paint.style = Paint.Style.STROKE
            paint.color = Color.BLACK
            paint.strokeWidth = 3f
            canvas.drawPath(path, paint)

            cursorView = ImageView(this).apply {
                setImageBitmap(bitmap)
                layoutParams = ViewGroup.LayoutParams(size, size)
                elevation = 9999f
                translationZ = 9999f
                x = 100f
                y = 100f
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
        cursorView?.apply {
            this.x = x
            this.y = y
            bringToFront()
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.source == InputDevice.SOURCE_MOUSE ||
            event.source == (InputDevice.SOURCE_MOUSE or InputDevice.SOURCE_TOUCHSCREEN)) {
            return super.dispatchTouchEvent(event)
        }

        val action = event.actionMasked
        val pointerCount = event.pointerCount
        val width = mSurface?.width?.toFloat() ?: resources.displayMetrics.widthPixels.toFloat()
        val height = mSurface?.height?.toFloat() ?: resources.displayMetrics.heightPixels.toFloat()

        if (cursorX < 0f) {
            cursorX = width / 2f
            cursorY = height / 2f
            updateCursor(cursorX, cursorY)
        }

        when (action) {
            MotionEvent.ACTION_DOWN -> {
                touchDownX = event.x
                touchDownY = event.y
                lastTouchX = touchDownX
                lastTouchY = touchDownY
                touchDownTime = System.currentTimeMillis()
                maxPointers = 1
                isDragging = false
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (pointerCount > maxPointers) {
                    maxPointers = pointerCount
                }
                if (pointerCount == 2) {
                    lastTwoFingerY = (event.getY(0) + event.getY(1)) / 2f
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

                    val sensitivity = 1.3f
                    cursorX = (cursorX + dx * sensitivity).coerceIn(0f, width)
                    cursorY = (cursorY + dy * sensitivity).coerceIn(0f, height)
                    updateCursor(cursorX, cursorY)

                    // Always forward mouse hover motion to native layer so tooltips and hover info trigger
                    SDLActivity.onNativeMouse(0, MotionEvent.ACTION_HOVER_MOVE, cursorX, cursorY, false)

                    val duration = System.currentTimeMillis() - touchDownTime
                    val dist = hypot((curX - touchDownX).toDouble(), (curY - touchDownY).toDouble()).toFloat()
                    val normX = (cursorX / width).coerceIn(0f, 1f)
                    val normY = (cursorY / height).coerceIn(0f, 1f)

                    if (!isDragging && duration > 260L && dist > 25f) {
                        isDragging = true
                        SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_DOWN, normX, normY, 1.0f)
                    }
                    if (isDragging) {
                        SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_MOVE, normX, normY, 1.0f)
                    }
                } else if (pointerCount == 2) {
                    val midY = (event.getY(0) + event.getY(1)) / 2f
                    val dy = midY - lastTwoFingerY
                    val scrollThreshold = 25f
                    if (Math.abs(dy) >= scrollThreshold) {
                        val scrollDir = if (dy > 0) 1f else -1f
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_SCROLL, 0f, scrollDir, false)
                        lastTwoFingerY = midY
                    }
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
            }
            MotionEvent.ACTION_UP -> {
                val duration = System.currentTimeMillis() - touchDownTime
                val dist = hypot((event.x - touchDownX).toDouble(), (event.y - touchDownY).toDouble()).toFloat()
                val normX = (cursorX / width).coerceIn(0f, 1f)
                val normY = (cursorY / height).coerceIn(0f, 1f)

                if (isDragging) {
                    SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_UP, normX, normY, 1.0f)
                    isDragging = false
                } else if (maxPointers == 1 && duration < 300L && dist < 45f) {
                    // Tap = Left Click: dispatch both native touch and mouse button event
                    SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_DOWN, normX, normY, 1.0f)
                    cursorView?.postDelayed({
                        SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_UP, normX, normY, 1.0f)
                    }, 40L)
                    SDLActivity.onNativeMouse(1, MotionEvent.ACTION_DOWN, cursorX, cursorY, false)
                    cursorView?.postDelayed({
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                    }, 40L)
                } else if (maxPointers == 2 && duration < 350L && dist < 60f) {
                    // Two-finger tap = Right Click / Cancel
                    SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_DOWN, 0f, 0f, 1.0f)
                    cursorView?.postDelayed({
                        SDLActivity.onNativeTouch(0, 0, MotionEvent.ACTION_UP, 0f, 0f, 1.0f)
                    }, 40L)
                    SDLActivity.onNativeMouse(2, MotionEvent.ACTION_DOWN, cursorX, cursorY, false)
                    cursorView?.postDelayed({
                        SDLActivity.onNativeMouse(0, MotionEvent.ACTION_UP, cursorX, cursorY, false)
                    }, 40L)
                }
                maxPointers = 1
            }
        }
        return true
    }

    override fun getLibraries(): Array<String> {
        return arrayOf("SDL2", "xsystem4")
    }

    override fun getArguments(): Array<String> {
        val saveFolder = intent.getStringExtra(EXTRA_SAVE_DIR)!!
        val gameRoot = intent.getStringExtra(EXTRA_GAME_ROOT)!!
        return arrayOf("--save-folder", saveFolder, "--save-format=rsm", gameRoot)
    }

    override fun onDestroy() {
        try {
            // Let SDL stop and join its native thread before terminating the game process.
            super.onDestroy()
        } finally {
            Process.killProcess(Process.myPid())
        }
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
