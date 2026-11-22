package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature
import com.example.ui.theme.DarkPageBg
import com.example.ui.theme.DuoLudoTheme
import com.example.ui.theme.LavenderPageBg
import com.example.ui.theme.LightPageBg
import com.example.ui.theme.WarmPageBg
import java.util.Locale

internal object DuoLudoWebAssets {
  const val ENTRY_URL = "https://appassets.androidplatform.net/assets/www/index.html"
  const val ASSET_HOST = "appassets.androidplatform.net"
  const val ASSET_PATH_PREFIX = "/assets/"

  fun createAssetLoader(context: Context): WebViewAssetLoader =
    WebViewAssetLoader.Builder()
      .addPathHandler(ASSET_PATH_PREFIX, WebViewAssetLoader.AssetsPathHandler(context.applicationContext))
      .build()

  fun isAllowedAssetRequest(uri: android.net.Uri?): Boolean {
    if (uri == null) return false
    return uri.scheme == "https" &&
      uri.host == ASSET_HOST &&
      (uri.path?.startsWith(ASSET_PATH_PREFIX) == true)
  }

  fun resolveThemeVisuals(uiTheme: String, customBgHex: String): Pair<Color, Boolean> {
    val parsedCustom = parseHexColorOrNull(customBgHex)
    if (parsedCustom != null) {
      val dark = ColorUtils.calculateLuminance(parsedCustom) < 0.45
      return Color(parsedCustom) to dark
    }
    return when (uiTheme) {
      "dark" -> DarkPageBg to true
      "warm" -> WarmPageBg to false
      "lavender" -> LavenderPageBg to false
      else -> LightPageBg to false
    }
  }

  private fun parseHexColorOrNull(raw: String): Int? {
    val trimmed = raw.trim()
    if (!Regex("^#[0-9a-fA-F]{6}$").matches(trimmed)) return null
    return runCatching { AndroidColor.parseColor(trimmed) }.getOrNull()
  }
}

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      DuoLudoHostScreen(
        onSyncSystemBars = { isDark ->
          WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isDark
            isAppearanceLightNavigationBars = !isDark
          }
        },
        onExitApp = { finish() },
      )
    }
  }
}

private class AndroidThemeBridge(
  private val onThemeUpdated: (uiTheme: String, customBgHex: String) -> Unit,
) {
  private val mainHandler = Handler(Looper.getMainLooper())

  @JavascriptInterface
  fun onThemeChanged(uiTheme: String?, customBgHex: String?) {
    val theme = uiTheme ?: "light"
    val bg = customBgHex ?: ""
    mainHandler.post { onThemeUpdated(theme, bg) }
  }
}

@Composable
private fun DuoLudoHostScreen(
  onSyncSystemBars: (Boolean) -> Unit,
  onExitApp: () -> Unit,
) {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current

  var isDarkTheme by remember { mutableStateOf(false) }
  var containerBg by remember { mutableStateOf(LightPageBg) }
  var showExitDialog by remember { mutableStateOf(false) }
  var loadError by remember { mutableStateOf(false) }
  var webViewGeneration by remember { mutableIntStateOf(0) }
  var webViewRef by remember { mutableStateOf<WebView?>(null) }

  SideEffect { onSyncSystemBars(isDarkTheme) }

  DuoLudoTheme(darkTheme = isDarkTheme) {
    DisposableEffect(lifecycleOwner, webViewRef) {
      val observer = LifecycleEventObserver { _, event ->
        val view = webViewRef ?: return@LifecycleEventObserver
        when (event) {
          Lifecycle.Event.ON_PAUSE -> {
            view.evaluateJavascript("window.DL && DL.onAppPause && DL.onAppPause();", null)
            view.onPause()
          }
          Lifecycle.Event.ON_RESUME -> {
            view.onResume()
            view.evaluateJavascript("window.DL && DL.onAppResume && DL.onAppResume();", null)
          }
          else -> Unit
        }
      }
      lifecycleOwner.lifecycle.addObserver(observer)
      onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    BackHandler(enabled = !showExitDialog) {
      val view = webViewRef
      if (loadError || view == null) {
        showExitDialog = true
      } else {
        view.evaluateJavascript(
          "(function(){return window.DL&&DL.handleAndroidBack?DL.handleAndroidBack():'confirm_exit';})();"
        ) { result ->
          if (result == null || result.contains("confirm_exit")) {
            showExitDialog = true
          }
        }
      }
    }

    Box(
      modifier =
        Modifier
          .fillMaxSize()
          .background(containerBg)
          .testTag("duo_ludo_root")
    ) {
      if (!loadError) {
        DuoLudoWebView(
          generation = webViewGeneration,
          onWebViewReady = { webViewRef = it },
          onThemeUpdated = { uiTheme, customBgHex ->
            val (bgColor, dark) = DuoLudoWebAssets.resolveThemeVisuals(uiTheme, customBgHex)
            containerBg = bgColor
            isDarkTheme = dark
          },
          onMainFrameError = { loadError = true },
          onRenderCrashRecover = {
            webViewRef = null
            webViewGeneration += 1
          },
        )
      } else {
        WebViewFallbackError(
          onRetry = {
            loadError = false
            webViewGeneration += 1
          },
        )
      }

      if (showExitDialog) {
        AlertDialog(
          onDismissRequest = { showExitDialog = false },
          modifier = Modifier.testTag("exit_dialog"),
          title = { Text(text = stringResource(R.string.exit_dialog_title)) },
          text = { Text(text = stringResource(R.string.exit_dialog_message)) },
          confirmButton = {
            Button(
              onClick = {
                showExitDialog = false
                onExitApp()
              },
              modifier = Modifier
                .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                .testTag("exit_confirm_button"),
            ) {
              Text(text = stringResource(R.string.exit_dialog_confirm))
            }
          },
          dismissButton = {
            TextButton(
              onClick = { showExitDialog = false },
              modifier = Modifier
                .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                .testTag("exit_cancel_button"),
            ) {
              Text(text = stringResource(R.string.exit_dialog_cancel))
            }
          },
        )
      }
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun DuoLudoWebView(
  generation: Int,
  onWebViewReady: (WebView) -> Unit,
  onThemeUpdated: (uiTheme: String, customBgHex: String) -> Unit,
  onMainFrameError: () -> Unit,
  onRenderCrashRecover: () -> Unit,
) {
  val context = LocalContext.current
  val assetLoader = remember(context) { DuoLudoWebAssets.createAssetLoader(context) }

  val webView =
    remember(generation) {
      WebView(context).apply {
        layoutParams =
          ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
          )
        setBackgroundColor(AndroidColor.TRANSPARENT)
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        overScrollMode = WebView.OVER_SCROLL_NEVER

        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          allowFileAccess = false
          allowContentAccess = false
          mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
          mediaPlaybackRequiresUserGesture = false
          setSupportZoom(false)
          builtInZoomControls = false
          displayZoomControls = false
          textZoom = 100
          cacheMode = WebSettings.LOAD_DEFAULT
        }

        var latestInsets = FloatArray(4)
        var pageReady = false

        fun pushSafeAreaInsets(view: WebView) {
          if (!pageReady) return
          val js =
            String.format(
              Locale.US,
              "window.DL && DL.setSafeAreaInsets && DL.setSafeAreaInsets(%.2f, %.2f, %.2f, %.2f);",
              latestInsets[0],
              latestInsets[1],
              latestInsets[2],
              latestInsets[3],
            )
          view.evaluateJavascript(js, null)
        }

        ViewCompat.setOnApplyWindowInsetsListener(this) { view, windowInsets ->
          val sysBars =
            windowInsets.getInsets(
              WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
          val imeBottom = windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom
          val density = view.resources.displayMetrics.density.coerceAtLeast(1f)
          val effectiveBottomPx = if (imeBottom > sysBars.bottom) 0 else sysBars.bottom
          latestInsets =
            floatArrayOf(
              sysBars.top / density,
              sysBars.right / density,
              effectiveBottomPx / density,
              sysBars.left / density,
            )
          pushSafeAreaInsets(this)
          windowInsets
        }

        addJavascriptInterface(AndroidThemeBridge(onThemeUpdated), "AndroidBridge")

        webViewClient =
          object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
              view: WebView,
              request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
              view: WebView,
              request: WebResourceRequest,
            ): Boolean {
              return !DuoLudoWebAssets.isAllowedAssetRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
              pageReady = true
              ViewCompat.requestApplyInsets(view)
              pushSafeAreaInsets(view)
            }

            override fun onReceivedError(
              view: WebView,
              request: WebResourceRequest,
              error: WebResourceErrorCompat,
            ) {
              if (request.isForMainFrame) {
                val desc =
                  if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_RESOURCE_ERROR_GET_DESCRIPTION)) {
                    error.description
                  } else {
                    "Main frame load error"
                  }
                Log.e("DuoLudoWebView", "Main frame load error: $desc")
                onMainFrameError()
              }
            }

            override fun onRenderProcessGone(
              view: WebView,
              detail: RenderProcessGoneDetail,
            ): Boolean {
              Log.w("DuoLudoWebView", "WebView render process gone (didCrash=${detail.didCrash()})")
              (view.parent as? ViewGroup)?.removeView(view)
              view.destroy()
              onRenderCrashRecover()
              return true
            }
          }

        webChromeClient =
          object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
              Log.d(
                "DuoLudoJS",
                "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} " +
                  "(${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})",
              )
              return true
            }
          }

        loadUrl(DuoLudoWebAssets.ENTRY_URL)
      }
    }

  DisposableEffect(webView) {
    onWebViewReady(webView)
    onDispose {
      webView.stopLoading()
      webView.removeJavascriptInterface("AndroidBridge")
      webView.destroy()
    }
  }

  AndroidView(
    factory = { webView },
    modifier = Modifier.fillMaxSize().testTag("duo_ludo_webview"),
  )
}

@Composable
private fun WebViewFallbackError(onRetry: () -> Unit) {
  Column(
    modifier = Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      text = stringResource(R.string.webview_error_title),
      style = MaterialTheme.typography.headlineSmall,
      color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(modifier = Modifier.height(16.dp))
    Button(
      onClick = onRetry,
      modifier = Modifier
        .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
        .testTag("webview_retry_button"),
    ) {
      Text(text = stringResource(R.string.webview_error_action))
    }
  }
}
