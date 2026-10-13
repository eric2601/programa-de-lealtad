package mx.lealtad.cliente.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Misma paleta que la web: base clara, texto azul marino y acento turquesa. */
object Turq {
    val Bg = Color(0xFFF4F6F8)
    val Surface = Color(0xFFFFFFFF)
    val Surface2 = Color(0xFFF3F6F8)
    val Surface3 = Color(0xFFE6EBF0)
    val Line = Color(0xFFE3E8EE)
    val LineStrong = Color(0xFFC9D2DC)
    val Ink = Color(0xFF142033)
    val Ink2 = Color(0xFF33415A)
    val Muted = Color(0xFF6B7683)
    val Accent = Color(0xFF22B8C6)
    val AccentStrong = Color(0xFF148A95)
    val AccentSoft = Color(0x1F22B8C6)
    val Ok = Color(0xFF1E9E62)
    val OkSoft = Color(0x1F1E9E62)
    val Warn = Color(0xFFB7791F)
    val WarnSoft = Color(0x24B7791F)
    val Crit = Color(0xFFD64545)
    val CritSoft = Color(0x1FD64545)
    val Navy = Color(0xFF1C2736)
}

private val Scheme = lightColorScheme(
    primary = Turq.Accent,
    onPrimary = Color.White,
    primaryContainer = Turq.AccentSoft,
    onPrimaryContainer = Turq.AccentStrong,
    secondary = Turq.Navy,
    onSecondary = Color.White,
    tertiary = Turq.Ok,
    background = Turq.Bg,
    onBackground = Turq.Ink,
    surface = Turq.Surface,
    onSurface = Turq.Ink,
    surfaceVariant = Turq.Surface2,
    onSurfaceVariant = Turq.Muted,
    outline = Turq.LineStrong,
    outlineVariant = Turq.Line,
    error = Turq.Crit,
    onError = Color.White,
)

private val Type = Typography(
    headlineMedium = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.8).sp, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Bold),
    bodyLarge = TextStyle(fontSize = 17.sp),
    bodyMedium = TextStyle(fontSize = 15.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp),
)

@Composable
fun ClienteTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, typography = Type, content = content)
}
