package io.github.kichikuou.xsystem4

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import com.google.android.material.motion.MotionUtils
import kotlin.math.abs
import kotlin.math.max

/** A short swipe reveals a button; a deliberate full swipe invokes that same action. */
class SwipeGameRow(context: Context) : FrameLayout(context) {
    private val actionWidth = (104 * resources.displayMetrics.density).toInt()
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val pinButton = actionButton(false)
    private val removeButton = actionButton(true)
    val card: View = LayoutInflater.from(context).inflate(R.layout.launcher_item, this, false)
    var onGestureStart: (() -> Unit)? = null
    private var pinAction: (() -> Unit)? = null
    private var removeAction: (() -> Unit)? = null
    private var pinAccessibilityAction = -1
    private var removeAccessibilityAction = -1
    private var animator: ValueAnimator? = null
    private var downX = 0f
    private var downY = 0f
    private var initialOffset = 0f
    private var swiping = false
    private var vertical = false
    private var fullSwipe = false
    private var actionPending = false

    init {
        addView(pinButton, LayoutParams(actionWidth, LayoutParams.MATCH_PARENT, Gravity.LEFT))
        addView(removeButton, LayoutParams(actionWidth, LayoutParams.MATCH_PARENT, Gravity.RIGHT))
        addView(card)
        pinButton.setOnClickListener { triggerAction(true) }
        removeButton.setOnClickListener { triggerAction(false) }
        updateOffset(0f)
    }

    private fun actionButton(remove: Boolean): MaterialButton {
        val backgroundAttr = if (remove) com.google.android.material.R.attr.colorErrorContainer
            else com.google.android.material.R.attr.colorSecondaryContainer
        val foregroundAttr = if (remove) com.google.android.material.R.attr.colorOnErrorContainer
            else com.google.android.material.R.attr.colorOnSecondaryContainer
        return MaterialButton(context).apply {
            text = context.getString(if (remove) R.string.md3_remove else R.string.library_pin)
            isAllCaps = false
            // Keep revealed actions behind the translated card in every press state.
            stateListAnimator = null
            elevation = 0f
            translationZ = 0f
            setPadding(0, 0, 0, 0)
            insetTop = 0
            insetBottom = 0
            minWidth = 0
            minimumWidth = 0
            cornerRadius = (12 * resources.displayMetrics.density).toInt()
            backgroundTintList = ColorStateList.valueOf(MaterialColors.getColor(this, backgroundAttr))
            setTextColor(MaterialColors.getColor(this, foregroundAttr))
        }
    }

    fun bind(pinned: Boolean, onClick: () -> Unit, onPin: () -> Unit, onRemove: () -> Unit) {
        reset()
        pinAction = onPin
        removeAction = onRemove
        val pinLabel = context.getString(if (pinned) R.string.library_unpin else R.string.library_pin)
        pinButton.text = pinLabel
        card.setOnClickListener {
            if (abs(card.translationX) > 1f) close() else onClick()
        }
        // TalkBack and keyboard users can invoke both actions without a swipe.
        if (pinAccessibilityAction != -1) ViewCompat.removeAccessibilityAction(card, pinAccessibilityAction)
        if (removeAccessibilityAction != -1) ViewCompat.removeAccessibilityAction(card, removeAccessibilityAction)
        pinAccessibilityAction = ViewCompat.addAccessibilityAction(card, pinLabel) { _, _ ->
            triggerAction(true)
            true
        }
        removeAccessibilityAction = ViewCompat.addAccessibilityAction(card,
            context.getString(R.string.md3_remove)) { _, _ ->
            triggerAction(false)
            true
        }
    }

    private fun updateOffset(offset: Float) {
        card.translationX = offset
        pinButton.visibility = if (offset > 0f) View.VISIBLE else View.INVISIBLE
        removeButton.visibility = if (offset < 0f) View.VISIBLE else View.INVISIBLE
        if (offset != 0f) {
            val button = if (offset > 0f) pinButton else removeButton
            val exposedWidth = max(actionWidth, abs(offset).toInt())
            if (button.layoutParams.width != exposedWidth) {
                button.layoutParams = button.layoutParams.apply { width = exposedWidth }
            }
        }
    }

    private fun animateTo(offset: Float, after: (() -> Unit)? = null) {
        animator?.cancel()
        val duration = MotionUtils.resolveThemeDuration(context,
            com.google.android.material.R.attr.motionDurationShort4, 200).toLong()
        animator = ValueAnimator.ofFloat(card.translationX, offset).apply {
            this.duration = duration
            interpolator = MotionUtils.resolveThemeInterpolator(context,
                com.google.android.material.R.attr.motionEasingEmphasizedDecelerateInterpolator,
                PathInterpolator(0.05f, 0.7f, 0.1f, 1f))
            addUpdateListener { updateOffset(it.animatedValue as Float) }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                private var cancelled = false
                override fun onAnimationCancel(animation: android.animation.Animator) { cancelled = true }
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (!cancelled) after?.invoke()
                }
            })
            start()
        }
    }

    fun close() {
        if (!actionPending) animateTo(0f)
    }

    private fun reset() {
        animator?.cancel()
        animator = null
        actionPending = false
        swiping = false
        fullSwipe = false
        updateOffset(0f)
    }

    private fun triggerAction(pin: Boolean) {
        if (actionPending) return
        actionPending = true
        val action = if (pin) pinAction else removeAction
        animateTo(0f) {
            actionPending = false
            action?.invoke()
        }
    }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (actionPending) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                animator?.cancel()
                downX = event.x
                downY = event.y
                initialOffset = card.translationX
                swiping = false
                vertical = false
                fullSwipe = false
                onGestureStart?.invoke()
                // Let the row decide the direction before ListView steals a horizontal drag.
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                if (vertical) return false
                val dx = event.x - downX
                val dy = event.y - downY
                if (abs(dy) > touchSlop && abs(dy) >= abs(dx)) {
                    vertical = true
                    parent?.requestDisallowInterceptTouchEvent(false)
                } else if (abs(dx) > touchSlop && abs(dx) > abs(dy)) {
                    swiping = true
                    card.isPressed = false
                    return true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                parent?.requestDisallowInterceptTouchEvent(false)
        }
        return swiping
    }

    private fun fullSwipeThreshold(): Float =
        max(width * 0.75f, actionWidth * 1.8f).coerceAtMost(width.toFloat())

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (actionPending) return true
        if (!swiping) return super.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                val offset = (initialOffset + event.x - downX).coerceIn(-width.toFloat(), width.toFloat())
                updateOffset(offset)
                val armed = abs(offset) >= fullSwipeThreshold()
                if (armed && !fullSwipe) performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                fullSwipe = armed
            }
            MotionEvent.ACTION_UP -> {
                val offset = card.translationX
                swiping = false
                parent?.requestDisallowInterceptTouchEvent(false)
                if (abs(offset) >= fullSwipeThreshold()) {
                    triggerAction(offset > 0f)
                } else {
                    val target = if (abs(offset) >= actionWidth * 0.4f) {
                        if (offset > 0f) actionWidth.toFloat() else -actionWidth.toFloat()
                    } else 0f
                    animateTo(target)
                }
            }
            MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                swiping = false
                parent?.requestDisallowInterceptTouchEvent(false)
                close()
            }
        }
        return true
    }

    override fun onDetachedFromWindow() {
        reset()
        super.onDetachedFromWindow()
    }
}
