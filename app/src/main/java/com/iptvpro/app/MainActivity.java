package com.iptvpro.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {

    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/index.html";
    private static final String BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    private WebView webView;
    private FrameLayout rootContainer;
    private FrameLayout fullscreenContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> filePathCallback;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) {
                    return;
                }
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    Uri dataUri = result.getData().getData();
                    if (dataUri != null) {
                        results = new Uri[]{dataUri};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#090C16"));
        getWindow().setNavigationBarColor(Color.parseColor("#090C16"));

        rootContainer = new FrameLayout(this);
        rootContainer.setBackgroundColor(Color.parseColor("#090C16"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090C16"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        fullscreenContainer.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        rootContainer.addView(webView);
        rootContainer.addView(fullscreenContainer);
        setContentView(rootContainer);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || !APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    return null;
                }
                String path = uri.getPath();
                if ("/api/xtream".equals(path) || "/api/stream".equals(path)) {
                    return handleNativeProxyRequest(request, uri, "/api/stream".equals(path));
                }
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    return assetLoader.shouldInterceptRequest(Uri.parse(START_URL));
                }
                return assetLoader.shouldInterceptRequest(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) {
                    return false;
                }
                String host = uri.getHost();
                if (APP_HOST.equalsIgnoreCase(host)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                fullscreenContainer.addView(customView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
                fullscreenContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                setImmersiveMode(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent;
                try {
                    intent = fileChooserParams.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                try {
                    fileChooserLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    exitFullscreen();
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    private Map<String, String> buildCorsHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        headers.put("Access-Control-Allow-Headers", "Content-Type, Range");
        headers.put("Cache-Control", "no-store");
        return headers;
    }

    private WebResourceResponse handleNativeProxyRequest(
            WebResourceRequest request,
            Uri requestUri,
            boolean isStreamMode
    ) {
        Map<String, String> corsHeaders = buildCorsHeaders();
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return new WebResourceResponse("text/plain", "UTF-8", 204, "No Content", corsHeaders,
                    new ByteArrayInputStream(new byte[0]));
        }

        String targetUrl = requestUri.getQueryParameter("url");
        if (targetUrl == null || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
            byte[] err = "{\"error\":\"Invalid URL\"}".getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("application/json", "UTF-8", 400, "Bad Request",
                    corsHeaders, new ByteArrayInputStream(err));
        }

        HttpURLConnection conn = null;
        try {
            String currentUrl = targetUrl;
            for (int rateRetry = 0; rateRetry < (isStreamMode ? 1 : 2); rateRetry++) {
                if (rateRetry > 0) {
                    try {
                        Thread.sleep(1200);
                    } catch (InterruptedException ignored) {
                        break;
                    }
                    currentUrl = targetUrl;
                }
                for (int hop = 0; hop < 5; hop++) {
                    URL urlObj = new URL(currentUrl);
                    conn = (HttpURLConnection) urlObj.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(45000);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", BROWSER_UA);
                    conn.setRequestProperty("Accept", "*/*");
                    String rangeHeader = request.getRequestHeaders() != null
                            ? request.getRequestHeaders().get("Range")
                            : null;
                    if (rangeHeader != null && !rangeHeader.isEmpty()) {
                        conn.setRequestProperty("Range", rangeHeader);
                    }

                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_PERM
                            || code == HttpURLConnection.HTTP_MOVED_TEMP
                            || code == HttpURLConnection.HTTP_SEE_OTHER
                            || code == 307
                            || code == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) {
                            break;
                        }
                        currentUrl = new URL(urlObj, location).toString();
                        continue;
                    }
                    break;
                }
                if (conn != null && !isStreamMode && rateRetry == 0) {
                    int checkCode = conn.getResponseCode();
                    if (checkCode == 429 || checkCode == 503) {
                        conn.disconnect();
                        conn = null;
                        continue;
                    }
                }
                break;
            }

            if (conn == null) {
                throw new IOException("No connection");
            }

            int status = conn.getResponseCode();
            String reason = conn.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) {
                reason = "OK";
            }

            String contentType = conn.getContentType();
            String mimeType = "application/octet-stream";
            String encoding = "UTF-8";
            if (contentType != null && !contentType.isEmpty()) {
                String[] parts = contentType.split(";");
                mimeType = parts[0].trim();
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase().startsWith("charset=")) {
                        encoding = p.substring(8).trim();
                    }
                }
            } else if (!isStreamMode) {
                mimeType = "application/json";
            } else if (currentUrl.toLowerCase().contains(".ts")) {
                mimeType = "video/mp2t";
            }

            InputStream rawStream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (rawStream == null) {
                rawStream = new ByteArrayInputStream(new byte[0]);
            }

            boolean isPlaylist = isStreamMode && (
                    mimeType.toLowerCase().contains("mpegurl")
                            || currentUrl.toLowerCase().contains(".m3u8")
            );

            if (isPlaylist && status >= 200 && status < 300) {
                String text = readStreamAsString(rawStream);
                conn.disconnect();
                String rewritten = rewriteM3u8ForAppAssets(text, currentUrl);
                byte[] outBytes = rewritten.getBytes(StandardCharsets.UTF_8);
                return new WebResourceResponse(
                        "application/vnd.apple.mpegurl",
                        "UTF-8",
                        200,
                        "OK",
                        corsHeaders,
                        new ByteArrayInputStream(outBytes)
                );
            }

            final HttpURLConnection finalConn = conn;
            InputStream wrappedStream = new FilterInputStream(new BufferedInputStream(rawStream)) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        finalConn.disconnect();
                    }
                }
            };

            return new WebResourceResponse(mimeType, encoding, status, reason, corsHeaders, wrappedStream);
        } catch (Exception e) {
            if (conn != null) {
                conn.disconnect();
            }
            byte[] err = ("{\"error\":\"" + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}")
                    .getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("application/json", "UTF-8", 502, "Bad Gateway",
                    corsHeaders, new ByteArrayInputStream(err));
        }
    }

    private String readStreamAsString(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[8192];
        int nRead;
        while ((nRead = in.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }
        return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    }

    private String rewriteM3u8ForAppAssets(String content, String baseUrlStr) {
        StringBuilder sb = new StringBuilder();
        URL baseUrl;
        try {
            baseUrl = new URL(baseUrlStr);
        } catch (Exception e) {
            return content;
        }
        Pattern uriAttrPattern = Pattern.compile("URI=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);
        String[] lines = content.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                sb.append(line).append('\n');
                continue;
            }
            if (trimmed.startsWith("#")) {
                Matcher m = uriAttrPattern.matcher(line);
                StringBuffer replaced = new StringBuffer();
                while (m.find()) {
                    String ref = m.group(1);
                    String proxied = toAssetProxyUrl(baseUrl, ref);
                    m.appendReplacement(replaced, Matcher.quoteReplacement("URI=\"" + proxied + "\""));
                }
                m.appendTail(replaced);
                sb.append(replaced).append('\n');
            } else {
                sb.append(toAssetProxyUrl(baseUrl, trimmed)).append('\n');
            }
        }
        return sb.toString();
    }

    private String toAssetProxyUrl(URL baseUrl, String ref) {
        try {
            String abs = new URL(baseUrl, ref).toString();
            return "https://" + APP_HOST + "/api/stream?url=" + Uri.encode(abs);
        } catch (Exception e) {
            return ref;
        }
    }

    private void exitFullscreen() {
        if (customView == null) {
            return;
        }
        fullscreenContainer.removeView(customView);
        fullscreenContainer.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
        }
        customView = null;
        customViewCallback = null;
        setImmersiveMode(false);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    private void setImmersiveMode(boolean enable) {
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller == null) {
            return;
        }
        if (enable) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        } else {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
            controller.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
