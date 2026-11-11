package io.github.kichikuou.xsystem4

import androidx.appcompat.app.AppCompatActivity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.TextView
import com.google.android.material.appbar.MaterialToolbar

class LicensesMenuActivity : AppCompatActivity() {
    class Entry(val displayName: String, val fileName: String, val url: String)
    private val entries: ArrayList<Entry> = arrayListOf(
        Entry("xsystem4", "xsystem4", "https://github.com/nunuhara/xsystem4"),
        Entry("libsys4", "libsys4", "https://github.com/nunuhara/libsys4"),
        Entry("SDL", "SDL", "https://www.libsdl.org/"),
        Entry("cglm", "cglm", "https://github.com/recp/cglm"),
        Entry("FreeType", "freetype", "https://freetype.org/"),
        Entry("libdeflate", "libdeflate", "https://github.com/ebiggers/libdeflate"),
        Entry("libffi", "libffi", "https://sourceware.org/libffi/"),
        Entry("libjpeg-turbo", "libjpeg-turbo", "https://libjpeg-turbo.org/"),
        Entry("libogg", "libogg", "https://xiph.org/ogg/"),
        Entry("libpng", "libpng", "http://www.libpng.org/pub/png/libpng.html"),
        Entry("libsndfile", "libsndfile", "https://libsndfile.github.io/libsndfile/"),
        Entry("libvorbis", "libvorbis", "https://xiph.org/vorbis/"),
        Entry("libwebp", "libwebp", "https://chromium.googlesource.com/webm/libwebp/"),
        Entry("VL Gothic Regular", "VL-Gothic-Regular", "http://vlgothic.dicey.org/"),
        Entry("Hanazono Mincho A", "HanaMinA", "http://fonts.jp/hanazono/"),
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_licenses_menu)
        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }
        val listView = findViewById<ListView>(R.id.list)
        listView.setItemsCanFocus(true)
        listView.adapter = object : BaseAdapter() {
            override fun getCount() = entries.size
            override fun getItem(position: Int) = entries[position]
            override fun getItemId(position: Int) = position.toLong()

            override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
                val entry = getItem(position)
                val view = convertView ?: layoutInflater.inflate(R.layout.license_item, parent, false)
                view.findViewById<TextView>(R.id.title).text = entry.displayName
                view.findViewById<TextView>(R.id.subtitle).text = entry.url
                view.setOnClickListener {
                    startActivity(Intent(this@LicensesMenuActivity, LicensesActivity::class.java).apply {
                        putExtra(LicensesActivity.EXTRA_DISPLAY_NAME, entry.displayName)
                        putExtra(LicensesActivity.EXTRA_FILE_NAME, entry.fileName)
                    })
                }
                return view
            }
        }
    }
}
