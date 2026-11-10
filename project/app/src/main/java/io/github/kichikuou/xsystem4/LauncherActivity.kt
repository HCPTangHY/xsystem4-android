package io.github.kichikuou.xsystem4

import android.app.Activity
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.Html
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ImageView
import android.widget.ListView
import android.widget.TextView

private const val ICON_SIZE_DP = 56
private const val INSTALL_REQUEST = 1

private class GameListAdapter(
    activity: Activity,
    private val gameList: GameList,
    private val libraryStore: GameLibraryStore,
    private val onClick: (Item) -> Unit,
    private val onPin: (Item, Boolean) -> Unit,
    private val onRemove: (Item) -> Unit,
) : BaseAdapter() {
    private val context: Context = activity
    private var items: List<Item> = emptyList()
    private var history: Map<String, GameHistory> = emptyMap()
    private var activeRow: SwipeGameRow? = null

    init { refresh() }

    fun refresh() {
        activeRow?.close()
        activeRow = null
        history = libraryStore.readAll()
        items = (0 until gameList.size).map { gameList[it] }.sortedWith(
            compareByDescending<Item> { history[it.path.path]?.pinned == true }
                .thenByDescending { history[it.path.path]?.lastPlayed ?: 0L }
                .thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
                .thenBy { it.path.path })
        notifyDataSetChanged()
    }

    override fun getCount(): Int = items.size
    override fun getItem(position: Int): Item = items[position]
    override fun getItemId(position: Int): Long = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
        val item = items[position]
        val stats = history[item.path.path] ?: GameHistory()
        val row = convertView as? SwipeGameRow ?: SwipeGameRow(context)
        val view = row.card
        val icon = item.getIconBitmap((ICON_SIZE_DP * context.resources.displayMetrics.density).toInt())
        view.findViewById<ImageView>(R.id.icon).setImageBitmap(icon)
        val title = view.findViewById<TextView>(R.id.title)
        title.text = item.name
        title.setTextColor(Md3Ui.color(context,
            if (item.error != null) R.color.md3_on_surface_variant else R.color.md3_on_surface))
        view.findViewById<View>(R.id.pinned_icon).visibility = if (stats.pinned) View.VISIBLE else View.GONE
        view.findViewById<TextView>(R.id.subtitle).text =
            if (item.error != null) context.getString(R.string.md3_game_error) else playTimeLabel(stats.playTimeMs)
        row.bind(stats.pinned, { onClick(item) }, { onPin(item, !stats.pinned) }, { onRemove(item) })
        row.onGestureStart = {
            if (activeRow !== row) activeRow?.close()
            activeRow = row
        }
        return row
    }

    private fun playTimeLabel(milliseconds: Long): String {
        val minutes = milliseconds / 60_000L
        return when {
            milliseconds == 0L -> context.getString(R.string.library_not_played)
            minutes == 0L -> context.getString(R.string.library_less_than_minute)
            minutes < 60L -> context.getString(R.string.library_play_minutes, minutes)
            else -> context.getString(R.string.library_play_hours, minutes / 60L, minutes % 60L)
        }
    }
}

class LauncherActivity : AppCompatActivity(), GameListObserver {
    companion object {
        private var savedGameList: GameList? = null
    }

    private lateinit var gameList: GameList
    private lateinit var adapter: GameListAdapter
    private lateinit var libraryStore: GameLibraryStore
    private var progressDialog: Dialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.launcher)
        findViewById<View>(R.id.import_game).setOnClickListener { importGame() }
        findViewById<View>(R.id.library_help).setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle(R.string.md3_help)
                .setMessage(Html.fromHtml(getString(R.string.usage)))
                .setPositiveButton(R.string.md3_got_it, null)
                .show()
        }
        findViewById<View>(R.id.library_licenses).setOnClickListener {
            startActivity(Intent(this, LicensesMenuActivity::class.java))
        }

        libraryStore = GameLibraryStore(this)
        gameList = getGameList(refresh = true)
        gameList.observer = this
        adapter = createAdapter()

        val listView = findViewById<ListView>(R.id.list)
        listView.setItemsCanFocus(true)
        listView.adapter = adapter
        listView.emptyView = findViewById(R.id.empty)
        findViewById<TextView>(R.id.usage).text = Html.fromHtml(getString(R.string.usage))
        renderInstallState(gameList.installState)
    }

    override fun onResume() {
        super.onResume()
        adapter.refresh()
    }

    override fun onDestroy() {
        if (gameList.observer === this) {
            gameList.observer = null
        }
        dismissProgressDialog()
        libraryStore.close()
        super.onDestroy()
    }

    override fun onRestart() {
        super.onRestart()
        // Pick up games copied over USB when returning to the library. The
        // shared list is retained while an import or its result is pending.
        val refreshed = getGameList(refresh = true)
        if (refreshed !== gameList) {
            setGameList(refreshed)
        } else {
            renderInstallState(gameList.installState)
        }
    }

    private fun importGame() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            MaterialAlertDialogBuilder(this).setMessage("ZIP 导入需要 Android 7.0 或更高版本。")
                .setPositiveButton(R.string.ok, null).show()
            return
        }
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply { type = "application/zip" }
        startActivityForResult(Intent.createChooser(intent, getString(R.string.choose_a_file)), INSTALL_REQUEST)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK)
            return
        val uri = data?.data ?: return
        when (requestCode) {
            INSTALL_REQUEST -> {
                val input = contentResolver.openInputStream(uri) ?: return
                gameList.install(input)
                renderInstallState(gameList.installState)
            }
        }
    }

    override fun onInstallProgress(path: String) {
        renderInstallState(gameList.installState)
    }

    override fun onInstallSuccess() {
        renderInstallState(gameList.installState)
    }

    override fun onInstallFailure(msgId: Int) {
        renderInstallState(gameList.installState)
    }

    private fun getGameList(refresh: Boolean): GameList {
        if (savedGameList == null || refresh && savedGameList?.installState is InstallState.Idle) {
            savedGameList = GameList(this)
        }
        return savedGameList!!
    }

    private fun setGameList(newGameList: GameList) {
        if (gameList.observer === this) {
            gameList.observer = null
        }
        gameList = newGameList
        gameList.observer = this
        adapter = createAdapter()
        findViewById<ListView>(R.id.list).adapter = adapter
        renderInstallState(gameList.installState)
    }

    private fun onListItemClick(item: Item) {
        if (item.error != null) {
            MaterialAlertDialogBuilder(this)
                .setTitle(R.string.error)
                .setMessage(item.error)
                .setPositiveButton(R.string.ok, null)
                .show()
            return
        }
        val i = Intent()
        i.setClass(applicationContext, XSystem4Activity::class.java)
        i.putExtra(XSystem4Activity.EXTRA_GAME_ROOT, item.path.path)
        i.putExtra(XSystem4Activity.EXTRA_SAVE_DIR, item.savedir!!.path)
        startActivity(i)
    }

    private fun createAdapter() = GameListAdapter(this, gameList, libraryStore,
        ::onListItemClick, ::onPinItem, ::confirmRemoveItem)

    private fun onPinItem(item: Item, pinned: Boolean) {
        libraryStore.setPinned(item.path.path, pinned)
        adapter.refresh()
        if (pinned) findViewById<ListView>(R.id.list).setSelection(0)
    }

    private fun confirmRemoveItem(item: Item) {
        MaterialAlertDialogBuilder(this).setTitle(R.string.uninstall_dialog_title)
            .setMessage(getString(R.string.uninstall_dialog_message, item.name))
            .setPositiveButton(R.string.md3_remove) {_, _ ->
                gameList.uninstall(item)
                libraryStore.remove(item.path.path)
                adapter.refresh()
            }
            .setNegativeButton(R.string.cancel) {_, _ -> }
            .show()
    }

    private fun renderInstallState(state: InstallState) {
        when (state) {
            InstallState.Idle -> dismissProgressDialog()
            is InstallState.Installing -> showProgressDialog(state.progress)
            InstallState.Succeeded -> {
                dismissProgressDialog()
                adapter.refresh()
                gameList.consumeInstallResult()
            }
            is InstallState.Failed -> {
                dismissProgressDialog()
                MaterialAlertDialogBuilder(this).setTitle(R.string.error)
                    .setMessage(state.msgId)
                    .setPositiveButton(R.string.ok) {_, _ -> }
                    .show()
                gameList.consumeInstallResult()
            }
        }
    }

    private fun showProgressDialog(progress: String? = null) {
        if (progressDialog == null) {
            progressDialog = MaterialAlertDialogBuilder(this)
                .setTitle(R.string.install_dialog_title)
                .setView(R.layout.progress_dialog)
                .setCancelable(false)
                .show()
        }
        progress?.let {
            progressDialog?.findViewById<TextView>(R.id.text)?.text = getString(R.string.install_progress, it)
        }
    }

    private fun dismissProgressDialog() {
        progressDialog?.dismiss()
        progressDialog = null
    }
}
