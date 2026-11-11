package io.github.kichikuou.xsystem4

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.PopupWindow
import com.google.android.material.button.MaterialButton
import com.google.android.material.motion.MotionUtils
import android.content.res.ColorStateList
import android.util.TypedValue
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.core.widget.TextViewCompat
import com.google.android.material.color.MaterialColors
import com.google.android.material.snackbar.Snackbar

/** Shared neutral palette. Night resources also work on the SDL Activity. */
object Md3Ui {
    fun color(context: Context, resource: Int) = ContextCompat.getColor(context, resource)
    fun background(context: Context, resource: Int, radius: Int = 28) = GradientDrawable().apply {
        setColor(color(context, resource))
        cornerRadius = radius * context.resources.displayMetrics.density
    }
    /** Container shape filled with a theme color role (surfaceContainer*, etc.). */
    fun surface(context: Context, roleAttr: Int, radius: Int) = GradientDrawable().apply {
        setColor(role(context, roleAttr))
        cornerRadius = radius * context.resources.displayMetrics.density
    }
    fun button(context: Context, text: String, filled: Boolean = false, action: () -> Unit): MaterialButton {
        // defStyleAttr must name a theme attribute, not a widget style resource.
        // This keeps the text, background and ripple on the same Material 3 style.
        val styleAttr = if (filled) com.google.android.material.R.attr.materialButtonStyle
            else com.google.android.material.R.attr.borderlessButtonStyle
        return MaterialButton(context, null, styleAttr).apply {
            this.text = text
            isAllCaps = false
            minHeight = (48 * resources.displayMetrics.density).toInt()
            setOnClickListener { action() }
        }
    }

    private fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()

    /** Resolves a Material theme color role such as colorOnSurfaceVariant. */
    fun role(context: Context, attr: Int) = MaterialColors.getColor(context, attr, 0)

    /** Applies a Material 3 type scale entry (e.g. textAppearanceTitleSmall). */
    fun <T : TextView> T.typeScale(attr: Int, colorAttr: Int = com.google.android.material.R.attr.colorOnSurface): T {
        val value = TypedValue()
        if (context.theme.resolveAttribute(attr, value, true))
            TextViewCompat.setTextAppearance(this, value.resourceId)
        setTextColor(role(context, colorAttr))
        return this
    }

    fun text(context: Context, text: CharSequence, attr: Int,
             colorAttr: Int = com.google.android.material.R.attr.colorOnSurface) =
        TextView(context).apply { this.text = text }.typeScale(attr, colorAttr)

    /** Standard icon button: 48dp target, onSurfaceVariant icon. */
    fun iconButton(context: Context, icon: Int, description: String, action: () -> Unit) =
        MaterialButton(context, null, com.google.android.material.R.attr.materialIconButtonStyle).apply {
            setIconResource(icon)
            iconTint = ColorStateList.valueOf(role(context, com.google.android.material.R.attr.colorOnSurfaceVariant))
            contentDescription = description
            setOnClickListener { action() }
        }

    /** Filled tonal button (secondary container). */
    fun tonalButton(context: Context, text: String, action: () -> Unit) =
        button(context, text, true, action).apply {
            backgroundTintList = ColorStateList.valueOf(
                role(context, com.google.android.material.R.attr.colorSecondaryContainer))
            setTextColor(role(context, com.google.android.material.R.attr.colorOnSecondaryContainer))
        }

    /** Title row for sheets and full-screen panels: headline plus a close icon. */
    fun header(context: Context, title: String, closeDescription: String,
               icon: Int = R.drawable.ic_close_24, onClose: () -> Unit) =
        LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(context, title, com.google.android.material.R.attr.textAppearanceHeadlineSmall),
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(iconButton(context, icon, closeDescription, onClose))
        }

    /** Section label used inside sheets (titleSmall, onSurfaceVariant). */
    fun section(context: Context, text: String) =
        text(context, text, com.google.android.material.R.attr.textAppearanceTitleSmall,
            com.google.android.material.R.attr.colorOnSurfaceVariant).apply {
            setPadding(dp(context, 16), dp(context, 20), dp(context, 16), dp(context, 8))
        }

    /** Two-line list item: headline with supporting text, full-width ripple. */
    fun listItem(context: Context, headline: String, supporting: String?, action: () -> Unit) =
        LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(context, if (supporting == null) 56 else 72)
            setPadding(dp(context, 16), dp(context, 8), dp(context, 24), dp(context, 8))
            val ripple = TypedValue()
            context.theme.resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)
            setBackgroundResource(ripple.resourceId)
            isClickable = true
            isFocusable = true
            setOnClickListener { action() }
            addView(text(context, headline, com.google.android.material.R.attr.textAppearanceBodyLarge))
            if (supporting != null)
                addView(text(context, supporting, com.google.android.material.R.attr.textAppearanceBodyMedium,
                    com.google.android.material.R.attr.colorOnSurfaceVariant))
        }

    /** Snackbar replaces toasts for short confirmations. */
    fun snackbar(anchor: View, message: String) =
        Snackbar.make(anchor, message, Snackbar.LENGTH_SHORT).show()

    fun sideSheet(context: Context, root: View, panel: View, scrim: View): PopupWindow =
        object : PopupWindow(root, ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT, true) {
            private var closing = false

            private fun duration(entering: Boolean) = MotionUtils.resolveThemeDuration(context,
                if (entering) com.google.android.material.R.attr.motionDurationMedium2
                else com.google.android.material.R.attr.motionDurationShort4,
                if (entering) 300 else 200).toLong()

            private fun easing(entering: Boolean) = MotionUtils.resolveThemeInterpolator(context,
                if (entering) com.google.android.material.R.attr.motionEasingEmphasizedDecelerateInterpolator
                else com.google.android.material.R.attr.motionEasingEmphasizedAccelerateInterpolator,
                if (entering) PathInterpolator(0.05f, 0.7f, 0.1f, 1f)
                else PathInterpolator(0.3f, 0f, 0.8f, 0.15f))

            private fun hiddenPosition(): Float {
                val direction = if (panel.layoutDirection == View.LAYOUT_DIRECTION_RTL) 1 else -1
                return direction * (panel.width + 12 * context.resources.displayMetrics.density)
            }

            override fun showAtLocation(parent: View, gravity: Int, x: Int, y: Int) {
                animationStyle = 0
                // Start hidden before the first layout to avoid a visible first-frame jump.
                panel.alpha = 0f
                scrim.alpha = 0f
                panel.doOnLayout {
                    if (!closing && isShowing) {
                        panel.translationX = hiddenPosition()
                        panel.alpha = 1f
                        panel.animate().translationX(0f).setDuration(duration(true))
                            .setInterpolator(easing(true)).start()
                        scrim.animate().alpha(1f).setDuration(duration(true))
                            .setInterpolator(easing(true)).start()
                    }
                }
                super.showAtLocation(parent, gravity, x, y)
            }

            override fun dismiss() {
                if (closing || !isShowing) return
                closing = true
                panel.animate().cancel()
                scrim.animate().cancel()
                if (!root.isAttachedToWindow || !panel.isLaidOut) {
                    dismissWindow()
                    return
                }
                // Only the sheet moves; the scrim fades over the stationary game.
                scrim.animate().alpha(0f).setDuration(duration(false))
                    .setInterpolator(easing(false)).start()
                panel.animate().translationX(hiddenPosition()).setDuration(duration(false))
                    .setInterpolator(easing(false)).withEndAction { dismissWindow() }.start()
            }

            private fun dismissWindow() = super.dismiss()
        }
}
