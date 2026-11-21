package com.kwiwi.draft;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PDF export for the offline edition.
 *
 * window.print() never opens a print dialog in an Android WebView, and handing a
 * raw HTML file to the print framework would print the markup, not the page. So
 * the export HTML (with the CJK font embedded as data:) is loaded into a hidden
 * WebView and that WebView's own PrintDocumentAdapter is given to the print
 * framework — it re-renders the page, so "Save as PDF" produces the document.
 * The page writes the export to the app cache first and passes {cachePath}; the
 * plugin then loads that file with loadDataWithBaseURL against its parent dir,
 * so the multi-megabyte document never travels through the plugin-call JSON.
 *
 * Two things this plugin must get right or the PDF comes out blank:
 *  1. The hidden WebView is kept alive after print() while the framework may
 *     still call the adapter. Older builds destroyed it 2 minutes after the
 *     print dialog opened, which cancels/truncates long documents.
 *  2. The content is a single text stream, so the first layout pass may not see
 *     the full height; the print attributes force a full layout pass.
 *
 * Written in Java on purpose: the Capacitor Android template here is a plain
 * Java project (no Kotlin plugin), so a .kt file would be silently ignored.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    private static final String TAG = "PrintPlugin";

    /** Keeps a job alive while the print framework may still call the adapter. */
    private static final long MAX_JOB_LIFETIME_MS = 10 * 60 * 1000;
    /** Time allowed for loading, the data: font decode and the first layout. */
    private static final long SETTLE_MS = 1200;

    private static final Pattern FONT_FACE_COUNT = Pattern.compile("@font-face");
    private static final Pattern CJK_FAMILY = Pattern.compile(
        "font-family:'(?:Noto Serif (?:HK|SC|CJK|TC)|Source Han Serif (?:HK|SC|TC|CN))'"
    );
    private static final Pattern DATA_FONT = Pattern.compile("url\\(data:font/");

    /** Strong reference: a GC during the job kills the renderer. */
    private WebView printWebView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long jobStartedAt;
    private boolean jobInFlight;

    /**
     * Two ways in:
     *   { cachePath: "print/x.html", fileName } — the page wrote the export with
     *       the Filesystem plugin; we only load it (small plugin payload).
     *   { content: "<html>", fileName }         — direct HTML (kept as fallback).
     */
    @PluginMethod
    public void printHtml(PluginCall call) {
        final String content = call.getString("content");
        final String cachePath = call.getString("cachePath");
        final String fileName = call.getString("fileName", "export.html");
        if ((content == null || content.isEmpty()) && (cachePath == null || cachePath.isEmpty())) {
            call.reject("printHtml: missing content/cachePath");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                File dir = new File(getActivity().getCacheDir(), "print");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("printHtml: cannot create cache dir");
                    return;
                }
                File file;
                String html;
                if (cachePath != null && !cachePath.isEmpty()) {
                    file = resolveCacheFile(cachePath);
                    html = readFile(file);
                    Log.d(TAG, "loading export from " + file.getAbsolutePath() + " (" + html.length() + " chars)");
                } else {
                    file = new File(dir, sanitize(fileName));
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                    html = content;
                }
                startPrint(dir, file, html);
                JSObject result = new JSObject();
                result.put("printed", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("printHtml failed: " + error.getMessage(), error);
            }
        });
    }

    /** cachePath is relative to the app cache dir; refuse anything escaping it. */
    private File resolveCacheFile(String cachePath) throws IOException {
        File cacheDir = getActivity().getCacheDir();
        File file = new File(cacheDir, cachePath);
        String root = cacheDir.getCanonicalPath() + File.separator;
        if (!file.getCanonicalPath().startsWith(root)) {
            throw new IOException("cachePath outside cache dir: " + cachePath);
        }
        if (!file.isFile() || file.length() == 0) {
            throw new IOException("export file missing or empty: " + cachePath);
        }
        return file;
    }

    private String readFile(File file) throws IOException {
        byte[] bytes = Files.readAllBytes(file.toPath());
        return new String(bytes, StandardCharsets.UTF_8);
    }

    /**
     * Called by the page on the next export. A job that is still in flight is
     * left alone (destroying its WebView would truncate the PDF); the WebView is
     * released by the idle timer instead.
     */
    @PluginMethod
    public void cleanup(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!jobInFlight) releaseWebView();
            call.resolve();
        });
    }

    private String sanitize(String name) {
        String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return safe.isEmpty() ? "export.html" : safe;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void startPrint(final File dir, final File file, final String html) {
        if (jobInFlight) {
            Log.w(TAG, "previous print job still running; keeping its WebView");
            return;
        }
        releaseWebView();
        jobInFlight = true;
        jobStartedAt = System.currentTimeMillis();

        WebView webView = new WebView(getActivity());
        printWebView = webView;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        // Nothing in an export needs these; they can only start stray loads.
        settings.setBlockNetworkLoads(true);
        settings.setLoadsImagesAutomatically(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                Log.d(TAG, "page finished " + describeFonts(html));
                // Let the data: font decode and the first layout pass settle.
                handler.postDelayed(() -> printWhenReady(view), SETTLE_MS);
            }
        });

        // Base URL = cache dir so any relative reference still resolves; the HTML
        // itself comes from a string, which keeps the huge base64 out of a file
        // load and out of the WebView local server's MIME/encoding guessing.
        webView.loadDataWithBaseURL(
            "file://" + dir.getAbsolutePath() + "/",
            html,
            "text/html",
            "UTF-8",
            null
        );

        handler.postDelayed(() -> {
            long age = System.currentTimeMillis() - jobStartedAt;
            if (jobInFlight && age > MAX_JOB_LIFETIME_MS) {
                Log.w(TAG, "print job aged out after " + age + " ms");
                jobInFlight = false;
                releaseWebView();
            }
        }, MAX_JOB_LIFETIME_MS + 1000);
    }

    private void printWhenReady(final WebView view) {
        if (view != printWebView) return;
        try {
            PrintManager printManager =
                (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (printManager == null) {
                Log.e(TAG, "no PRINT_SERVICE");
                jobInFlight = false;
                releaseWebView();
                return;
            }
            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter("Draft export");
            printManager.print(
                "Draft",
                adapter,
                new PrintAttributes.Builder()
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build()
            );
            Log.d(TAG, "print job handed to the print framework");
            // The framework now owns the adapter; keep the WebView for a while.
            handler.postDelayed(() -> {
                jobInFlight = false;
                releaseWebView();
            }, 60000);
        } catch (Exception error) {
            Log.e(TAG, "print job failed", error);
            jobInFlight = false;
            releaseWebView();
        }
    }

    /** Diagnostics: how many faces the export actually carries (0 = blank risk). */
    private String describeFonts(String html) {
        return "font-faces=" + count(FONT_FACE_COUNT, html)
            + " cjk-faces=" + count(CJK_FAMILY, html)
            + " data-fonts=" + count(DATA_FONT, html);
    }

    private int count(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        int found = 0;
        while (matcher.find()) found++;
        return found;
    }

    private void releaseWebView() {
        WebView view = printWebView;
        if (view == null) return;
        printWebView = null;
        try {
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            view.setVisibility(View.GONE);
            view.stopLoading();
            view.destroy();
        } catch (Exception error) {
            Log.w(TAG, "destroy webview failed", error);
        }
    }
}
