package com.kwiwi.draft

import android.annotation.SuppressLint
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream

/**
 * PDF export for the offline edition.
 *
 * window.print() never opens a print dialog in an Android WebView, so the export
 * HTML (with the CJK font embedded as data:) is written to the cache dir, loaded
 * into a hidden WebView, and that WebView's own PrintDocumentAdapter is handed to
 * the print framework. The adapter renders the page (not the HTML source), so
 * "Save as PDF" in the system dialog produces the rendered document.
 */
@CapacitorPlugin(name = "Print")
class PrintPlugin : Plugin() {

    // Strong reference: a GC during the job kills the renderer.
    private var printWebView: WebView? = null

    @PluginMethod
    fun printHtml(call: PluginCall) {
        val content = call.getString("content")
        if (content.isNullOrEmpty()) {
            call.reject("printHtml: missing content")
            return
        }
        val fileName = call.getString("fileName") ?: "export.html"

        activity.runOnUiThread {
            try {
                val dir = File(activity.cacheDir, "print").apply { mkdirs() }
                val file = File(dir, sanitize(fileName))
                FileOutputStream(file).use { it.write(content.toByteArray(Charsets.UTF_8)) }
                startPrint(file)
                call.resolve(JSObject().put("printed", true))
            } catch (error: Exception) {
                call.reject("printHtml failed: ${error.message}", error)
            }
        }
    }

    private fun sanitize(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "export.html" }

    @SuppressLint("SetJavaScriptEnabled")
    private fun startPrint(file: File) {
        releaseWebView()
        val webView = WebView(activity)
        printWebView = webView
        webView.settings.javaScriptEnabled = false
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                // Let layout and the embedded font settle before snapshotting.
                view.postDelayed({
                    try {
                        val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                        val adapter = view.createPrintDocumentAdapter("Draft export")
                        printManager.print(
                            "Draft - ${file.nameWithoutExtension}",
                            adapter,
                            PrintAttributes.Builder().build()
                        )
                    } catch (error: Exception) {
                        android.util.Log.e("PrintPlugin", "print job failed", error)
                        releaseWebView()
                    }
                }, 600)
            }
        }
        webView.loadUrl("file://${file.absolutePath}")
    }

    /** Called by the page once the user is done with the system print dialog. */
    @PluginMethod
    fun cleanup(call: PluginCall) {
        activity.runOnUiThread {
            releaseWebView()
            call.resolve()
        }
    }

    private fun releaseWebView() {
        val view = printWebView ?: return
        printWebView = null
        try {
            view.stopLoading()
            view.destroy()
        } catch (error: Exception) {
            android.util.Log.w("PrintPlugin", "destroy webview failed", error)
        }
    }
}
