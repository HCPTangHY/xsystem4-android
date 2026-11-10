package io.github.kichikuou.xsystem4

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.SystemClock
import android.view.View
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

/** A centered pointer; only its shape eases, never its input position. */
class ElasticCursorView(context: Context) : View(context) {
    companion object {
        const val VIEW_SIZE = 80
        // Physical pixels; 20% larger than the original 28 px wide pointer.
        private const val RADIUS = 17f
        private const val POINT_COUNT = 16
        private const val STRETCH_START_SPEED = 650f
        private const val STRETCH_SPEED_RANGE = 3000f
        private const val MAX_STRETCH = 0.65f
        private const val MAX_BEND = RADIUS * 0.22f
        private const val HELD_SCALE = 0.8f
        private const val RIGHT_CLICK_SCALE = 1.2f
    }

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        alpha = 170
    }
    private var pressScale = 1f
    private var clickFeedbackUntil = 0L
    private var clickFeedbackScale = HELD_SCALE

    var dragging = false
        set(value) {
            if (field == value) return
            field = value
            requestFrame()
        }

    private var lastX = 0f
    private var lastY = 0f
    private var hasPositionSample = false
    private var lastMotionAt = 0L
    private var lastFrameAt = 0L
    private var pendingX = 0f
    private var pendingY = 0f
    private var velocityX = 0f
    private var velocityY = 0f
    private var trailingVelocityX = 0f
    private var trailingVelocityY = 0f
    private var framePending = false
    private val unitX = FloatArray(POINT_COUNT) { cos(it * Math.PI * 2 / POINT_COUNT).toFloat() }
    private val unitY = FloatArray(POINT_COUNT) { sin(it * Math.PI * 2 / POINT_COUNT).toFloat() }
    private val outlineX = FloatArray(POINT_COUNT) { unitX[it] * RADIUS }
    private val outlineY = FloatArray(POINT_COUNT) { unitY[it] * RADIUS }
    private val outline = Path()

    private val frame = object : Runnable {
        override fun run() {
            framePending = false
            val now = SystemClock.uptimeMillis()
            val elapsed = if (lastFrameAt == 0L) 16f else (now - lastFrameAt).coerceIn(1L, 50L).toFloat()
            lastFrameAt = now
            // Aggregate input per frame: batched touch events must not look like speed spikes.
            val velocityResponse = 1f - exp(-elapsed / 50f)
            velocityX += (pendingX * 1000f / elapsed - velocityX) * velocityResponse
            velocityY += (pendingY * 1000f / elapsed - velocityY) * velocityResponse
            pendingX = 0f
            pendingY = 0f
            val trailingResponse = 1f - exp(-elapsed / 120f)
            trailingVelocityX += (velocityX - trailingVelocityX) * trailingResponse
            trailingVelocityY += (velocityY - trailingVelocityY) * trailingResponse

            val moving = now - lastMotionAt <= 48L
            val speed = hypot(velocityX, velocityY)
            val amount = if (moving) ((speed - STRETCH_START_SPEED) / STRETCH_SPEED_RANGE)
                .coerceIn(0f, 1f) else 0f
            // A quadratic ramp leaves slow movements almost circular.
            val strength = amount * amount
            val elongation = 1f + MAX_STRETCH * strength
            val compression = 1f / elongation
            val directionX = if (speed > 1f) velocityX / speed else 1f
            val directionY = if (speed > 1f) velocityY / speed else 0f
            val trailingSpeed = hypot(trailingVelocityX, trailingVelocityY)
            val turn = if (trailingSpeed > 1f) {
                (directionX * trailingVelocityY - directionY * trailingVelocityX) / trailingSpeed
            } else 0f
            val bend = turn.coerceIn(-1f, 1f) * MAX_BEND * strength
            val response = 1f - exp(-elapsed / 65f)
            var deviation = 0f
            for (i in 0 until POINT_COUNT) {
                val along = unitX[i] * directionX + unitY[i] * directionY
                val across = -unitX[i] * directionY + unitY[i] * directionX
                // Bow the contour toward the previous motion direction when turning.
                // The 1/4 offset keeps the filled shape's center at the click position.
                val curvedAcross = RADIUS * compression * across + bend * (along * along - 0.25f)
                val targetX = RADIUS * elongation * along * directionX - curvedAcross * directionY
                val targetY = RADIUS * elongation * along * directionY + curvedAcross * directionX
                // Blend world-space points instead of rotating a rigid ellipse.
                outlineX[i] += (targetX - outlineX[i]) * response
                outlineY[i] += (targetY - outlineY[i]) * response
                deviation = max(deviation, max(abs(outlineX[i] - unitX[i] * RADIUS),
                    abs(outlineY[i] - unitY[i] * RADIUS)))
            }
            val clicking = now < clickFeedbackUntil
            val targetScale = when {
                clicking -> clickFeedbackScale
                dragging -> HELD_SCALE
                else -> 1f
            }
            pressScale += (targetScale - pressScale) * (1f - exp(-elapsed / 60f))
            val resizing = abs(targetScale - pressScale) > 0.001f
            if (!resizing) pressScale = targetScale
            invalidate()
            if (moving || deviation > 0.01f || resizing || clicking) {
                requestFrame()
            } else {
                lastFrameAt = 0L
                clearVelocity()
                resetOutline()
            }
        }
    }

    init {
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun moveTo(pointerX: Float, pointerY: Float) {
        x = pointerX - (if (width > 0) width else VIEW_SIZE) / 2f
        y = pointerY - (if (height > 0) height else VIEW_SIZE) / 2f
        val now = SystemClock.uptimeMillis()
        if (hasPositionSample) {
            val dx = pointerX - lastX
            val dy = pointerY - lastY
            if (dx != 0f || dy != 0f) {
                if (now - lastMotionAt > 160L) clearVelocity()
                pendingX += dx
                pendingY += dy
                lastMotionAt = now
                requestFrame()
            }
        }
        lastX = pointerX
        lastY = pointerY
        hasPositionSample = true
    }

    fun showClickFeedback(button: Int) {
        if (visibility != VISIBLE) return
        // Keep a short tap visible without extending the native mouse press.
        clickFeedbackScale = if (button == 2) RIGHT_CLICK_SCALE else HELD_SCALE
        clickFeedbackUntil = SystemClock.uptimeMillis() + 120L
        requestFrame()
    }

    fun relax() {
        lastMotionAt = 0L
        hasPositionSample = false
        clearVelocity()
        requestFrame()
    }

    fun resetMotion() {
        dragging = false
        clickFeedbackUntil = 0L
        removeCallbacks(frame)
        framePending = false
        lastFrameAt = 0L
        hasPositionSample = false
        lastMotionAt = 0L
        clearVelocity()
        resetOutline()
        pressScale = 1f
        invalidate()
    }

    private fun clearVelocity() {
        pendingX = 0f
        pendingY = 0f
        velocityX = 0f
        velocityY = 0f
        trailingVelocityX = 0f
        trailingVelocityY = 0f
    }

    private fun resetOutline() {
        for (i in 0 until POINT_COUNT) {
            outlineX[i] = unitX[i] * RADIUS
            outlineY[i] = unitY[i] * RADIUS
        }
    }

    private fun requestFrame() {
        if (!framePending && isAttachedToWindow && visibility == VISIBLE) {
            framePending = true
            postOnAnimation(frame)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        outline.rewind()
        outline.moveTo(outlineX[0], outlineY[0])
        for (i in 0 until POINT_COUNT) {
            val previous = (i + POINT_COUNT - 1) % POINT_COUNT
            val next = (i + 1) % POINT_COUNT
            val following = (i + 2) % POINT_COUNT
            outline.cubicTo(
                outlineX[i] + (outlineX[next] - outlineX[previous]) / 6f,
                outlineY[i] + (outlineY[next] - outlineY[previous]) / 6f,
                outlineX[next] - (outlineX[following] - outlineX[i]) / 6f,
                outlineY[next] - (outlineY[following] - outlineY[i]) / 6f,
                outlineX[next], outlineY[next])
        }
        outline.close()
        canvas.save()
        canvas.translate(width / 2f, height / 2f)
        canvas.scale(pressScale, pressScale)
        canvas.drawPath(outline, fill)
        canvas.restore()
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility != VISIBLE) resetMotion()
    }

    override fun onDetachedFromWindow() {
        resetMotion()
        super.onDetachedFromWindow()
    }
}
