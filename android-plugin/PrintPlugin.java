package com.kwiwi.draft;

import android.annotation.SuppressLint;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * PDF export for the offline edition.
 *
 * window.print() never opens a print dialog in an Android WebView, and handing a
 * raw HTML file to the print framework would print the markup, not the page. So
 * the export HTML (with the CJK font embedded as data:) is written to the cache
 * dir, loaded into a hidden WebView, and that WebView's own
 * PrintDocumentAdapter is given to the print framework — it re-renders the page,
 * so "Save as PDF" in the system dialog produces the rendered document.
 *
 * Written in Java on purpose: the Capacitor Android template here is a plain
 * Java project (no Kotlin plugin), so a .kt file would be silently ignored.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    private static final String TAG = "PrintPlugin";

    /** Strong reference: a GC during the job kills the renderer. */
    private WebView printWebView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String content = call.getString("content");
        if (content == null || content.isEmpty()) {
            call.reject("printHtml: missing content");
            return;
        }
        final String fileName = call.getString("fileName", "export.html");

        getActivity().runOnUiThread(() -> {
            try {
                File dir = new File(getActivity().getCacheDir(), "print");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("printHtml: cannot create cache dir");
                    return;
                }
                File file = new File(dir, sanitize(fileName));
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                startPrint(file);
                JSObject result = new JSObject();
                result.put("printed", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("printHtml failed: " + error.getMessage(), error);
            }
        });
    }

    /** Called by the page once the user is done with the system print dialog. */
    @PluginMethod
    public void cleanup(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            releaseWebView();
            call.resolve();
        });
    }

    private String sanitize(String name) {
        String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return safe.isEmpty() ? "export.html" : safe;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void startPrint(final File file) {
        releaseWebView();
        WebView webView = new WebView(getActivity());
        printWebView = webView;
        webView.getSettings().setJavaScriptEnabled(false);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Let layout and the embedded font settle before snapshotting.
                view.postDelayed(() -> {
                    try {
                        PrintManager printManager =
                            (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            Log.e(TAG, "no PRINT_SERVICE");
                            releaseWebView();
                            return;
                        }
                        printManager.print(
                            "Draft - " + stripExtension(file.getName()),
                            view.createPrintDocumentAdapter("Draft export"),
                            new PrintAttributes.Builder().build()
                        );
                    } catch (Exception error) {
                        Log.e(TAG, "print job failed", error);
                        releaseWebView();
                    }
                }, 600);
            }
        });
        webView.loadUrl("file://" + file.getAbsolutePath());
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private void releaseWebView() {
        WebView view = printWebView;
        if (view == null) return;
        printWebView = null;
        try {
            view.stopLoading();
            view.destroy();
        } catch (Exception error) {
            Log.w(TAG, "destroy webview failed", error);
        }
    }
}
