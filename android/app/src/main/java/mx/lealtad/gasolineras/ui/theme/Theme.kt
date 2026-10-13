package mx.lealtad.gasolineras.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Misma paleta que la web: base clara, texto azul marino y acento turquesa. (Los nombres se conservan por compatibilidad.) */
object Tech {
    val Bg = Color(0xFFF4F6F8)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceHigh = Color(0xFFF3F6F8)
    val Outline = Color(0xFFC9D2DC)
    val Ink = Color(0xFF142033)
    val Muted = Color(0xFF6B7683)
    val Cyan = Color(0xFF22B8C6)
    val CyanDeep = Color(0xFF148A95)
    val Violet = Color(0xFF1C2736)
    val Mint = Color(0xFF1E9E62)
    val Amber = Color(0xFFB7791F)
    val Rose = Color(0xFFD64545)
    val Gradient = Brush.linearGradient(listOf(Cyan, CyanDeep))
}

private val Scheme = lightColorScheme(
    primary = Tech.Cyan,
    onPrimary = Color.White,
    primaryContainer = Color(0x1F22B8C6),
    onPrimaryContainer = Tech.CyanDeep,
    secondary = Tech.Violet,
    onSecondary = Color.White,
    tertiary = Tech.Mint,
    background = Tech.Bg,
    onBackground = Tech.Ink,
    surface = Tech.Surface,
    onSurface = Tech.Ink,
    surfaceVariant = Tech.SurfaceHigh,
    onSurfaceVariant = Tech.Muted,
    outline = Tech.Outline,
    outlineVariant = Color(0xFFE3E8EE),
    error = Tech.Rose,
    onError = Color.White,
)

private val Type = Typography(
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp),
)

@Composable
fun LealtadTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, typography = Type, content = content)
}
