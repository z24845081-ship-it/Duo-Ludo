package com.example

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.example.ui.theme.DarkPageBg
import com.example.ui.theme.LavenderPageBg
import com.example.ui.theme.LightPageBg
import com.example.ui.theme.WarmPageBg
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

  @Test
  fun `app name matches Duo Ludo`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    assertEquals("Duo Ludo", context.getString(R.string.app_name))
  }

  @Test
  fun `asset loader serves index styles fonts and scripts offline`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val loader = DuoLudoWebAssets.createAssetLoader(context)
    val requiredAssets =
      listOf(
        "www/index.html",
        "www/css/styles.css",
        "www/fonts/inter.ttf",
        "www/fonts/nunito.ttf",
        "www/fonts/poppins.ttf",
        "www/fonts/lora.ttf",
        "www/fonts/roboto.ttf",
        "www/js/config.js",
        "www/js/maps.js",
        "www/js/engine.js",
        "www/js/audio.js",
        "www/js/renderer.js",
        "www/js/ui.js",
        "www/js/game.js",
        "www/js/main.js",
      )

    for (asset in requiredAssets) {
      val uri = Uri.parse("https://${DuoLudoWebAssets.ASSET_HOST}/assets/$asset")
      val response = loader.shouldInterceptRequest(uri)
      assertNotNull("Expected packaged asset to resolve: $asset", response)
      response?.data?.use { stream ->
        assertTrue("Expected non-empty asset: $asset", stream.readBytes().isNotEmpty())
      }
    }
  }

  @Test
  fun `navigation whitelist permits only local appassets origin`() {
    assertTrue(
      DuoLudoWebAssets.isAllowedAssetRequest(Uri.parse(DuoLudoWebAssets.ENTRY_URL))
    )
    assertFalse(
      DuoLudoWebAssets.isAllowedAssetRequest(Uri.parse("https://example.com/"))
    )
    assertFalse(
      DuoLudoWebAssets.isAllowedAssetRequest(
        Uri.parse("http://${DuoLudoWebAssets.ASSET_HOST}/assets/www/index.html")
      )
    )
    assertFalse(
      DuoLudoWebAssets.isAllowedAssetRequest(Uri.parse("file:///android_asset/www/index.html"))
    )
  }

  @Test
  fun `theme visuals map preset and custom backgrounds accurately`() {
    assertEquals(LightPageBg to false, DuoLudoWebAssets.resolveThemeVisuals("light", ""))
    assertEquals(WarmPageBg to false, DuoLudoWebAssets.resolveThemeVisuals("warm", ""))
    assertEquals(LavenderPageBg to false, DuoLudoWebAssets.resolveThemeVisuals("lavender", ""))
    assertEquals(DarkPageBg to true, DuoLudoWebAssets.resolveThemeVisuals("dark", ""))

    val (_, customDark) = DuoLudoWebAssets.resolveThemeVisuals("light", "#101828")
    assertTrue(customDark)
    val (_, customLight) = DuoLudoWebAssets.resolveThemeVisuals("dark", "#FAFBFD")
    assertFalse(customLight)
  }

  @Test
  fun `main activity launches with AppCompat compatible theme and without errors`() {
    val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
    val activity = controller.get()
    assertNotNull(activity)
    val styledAttrs = activity.obtainStyledAttributes(androidx.appcompat.R.styleable.AppCompatTheme)
    assertTrue(
      "MainActivity theme must descend from Theme.AppCompat for WebView widgets",
      styledAttrs.hasValue(androidx.appcompat.R.styleable.AppCompatTheme_windowActionBar),
    )
    styledAttrs.recycle()
    controller.pause().resume().destroy()
  }
}
