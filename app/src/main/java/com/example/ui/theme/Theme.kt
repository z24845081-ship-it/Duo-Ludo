package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme =
  darkColorScheme(
    primary = DuoBlue,
    onPrimary = DarkInk,
    secondary = DuoPink,
    onSecondary = DarkInk,
    background = DarkPageBg,
    onBackground = DarkInk,
    surface = DarkSurface,
    onSurface = DarkInk,
    onSurfaceVariant = DarkMuted,
  )

private val LightColorScheme =
  lightColorScheme(
    primary = DuoBlue,
    onPrimary = LightSurface,
    secondary = DuoPink,
    onSecondary = LightSurface,
    background = LightPageBg,
    onBackground = LightInk,
    surface = LightSurface,
    onSurface = LightInk,
    onSurfaceVariant = LightMuted,
  )

@Composable
fun DuoLudoTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  content: @Composable () -> Unit,
) {
  val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
  MaterialTheme(colorScheme = colorScheme, typography = DuoLudoTypography, content = content)
}
