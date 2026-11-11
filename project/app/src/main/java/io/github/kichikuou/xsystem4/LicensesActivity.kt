package io.github.kichikuou.xsystem4

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.TextView
import com.google.android.material.appbar.MaterialToolbar
import java.io.BufferedReader

class LicensesActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_DISPLAY_NAME = "DISPLAY_NAME"
        const val EXTRA_FILE_NAME = "FILE_NAME"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_licenses)

        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = intent.getStringExtra(EXTRA_DISPLAY_NAME)
            setNavigationOnClickListener { finish() }
        }
        val path = "licenses/" + intent.getStringExtra(EXTRA_FILE_NAME)
        val text = assets.open(path).bufferedReader().use(BufferedReader::readText)
        findViewById<TextView>(R.id.license_text).text = text
    }
}
