package io.github.kichikuou.xsystem4

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.android.material.appbar.MaterialToolbar

class ManualActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_URL = "URL"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_manual)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        val url = intent.getStringExtra(EXTRA_URL)
        val webView = findViewById<WebView>(R.id.webview)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                toolbar.title = title
            }
        }
        webView.settings.javaScriptEnabled = false
        webView.settings.allowFileAccess = true
        if (url != null) {
            webView.loadUrl(url)
        }
    }
}
