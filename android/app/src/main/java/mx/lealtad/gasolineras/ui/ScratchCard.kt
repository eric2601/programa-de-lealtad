package mx.lealtad.gasolineras.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.lealtad.core.data.RevealResponse
import mx.lealtad.core.data.ScratchCardDto
import mx.lealtad.core.data.ScratchPrize
import mx.lealtad.gasolineras.ui.theme.Tech

private const val GRID_W = 16
private const val GRID_H = 8
private const val CLEAR_THRESHOLD = 0.55f

/**
 * Tarjeta "Carga, Rasca y Gana". El premio lo decide el servidor al emitirla; el primer
 * arrastre lo pide y lo acredita, y la capa plateada se borra con el dedo. Al despejar más de
 * la mitad, la capa desaparece con una animación corta.
 */
@Composable
fun ScratchCard(card: ScratchCardDto, onReveal: suspend () -> RevealResponse, onRevealed: (RevealResponse) -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var prize by remember(card.id) { mutableStateOf<ScratchPrize?>(card.prize) }
    var done by remember(card.id) { mutableStateOf(card.status == "revealed") }
    var error by remember { mutableStateOf<String?>(null) }
    var revealing by remember(card.id) { mutableStateOf(false) }
    val strokes = remember(card.id) { mutableStateListOf<Offset>() }
    val cells = remember(card.id) { mutableSetOf<Int>() }
    val overlayAlpha by animateFloatAsState(if (done) 0f else 1f, animationSpec = tween(500), label = "overlay")
    val expired = card.status == "expired" || card.status == "cancelled"
    val measurer = rememberTextMeasurer()

    fun ensureReveal() {
        if (prize != null || revealing) return
        revealing = true
        scope.launch {
            try { val r = onReveal(); prize = r.prize; onRevealed(r) } catch (e: Exception) { revealing = false; error = e.message }
        }
    }

    Column {
        Box(
            Modifier
                .fillMaxWidth()
                .height(150.dp)
                .clip(RoundedCornerShape(16.dp))
                .border(1.dp, if (done) Tech.Cyan.copy(alpha = 0.6f) else Tech.Outline, RoundedCornerShape(16.dp))
                .background(Brush.linearGradient(listOf(Tech.Surface, Tech.SurfaceHigh))),
        ) {
            // Cara con el premio (o la incógnita).
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                val p = prize
                when {
                    expired -> { Text("Tarjeta vencida", color = Tech.Muted, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text("Carga ${card.saleReference ?: "—"}", color = Tech.Muted, fontSize = 12.sp) }
                    p != null -> { Text(p.label, color = Tech.Cyan, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp); Text(if (done) "Ya están en tu saldo" else "sigue rascando…", color = Tech.Muted, fontSize = 12.sp) }
                    else -> { Text("?", color = Tech.Violet, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp); Text("Carga ${card.saleReference ?: ""} · vence ${card.expiresAt.take(10)}", color = Tech.Muted, fontSize = 12.sp) }
                }
            }
            if (!done && !expired) {
                Canvas(
                    Modifier
                        .fillMaxSize()
                        .alpha(overlayAlpha)
                        .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                        .pointerInput(card.id) {
                            detectDragGestures(
                                onDragStart = { p -> ensureReveal(); strokes.add(p); cells.add(cellOf(p, size.width, size.height)) },
                                onDrag = { change, _ -> strokes.add(change.position); cells.add(cellOf(change.position, size.width, size.height)) },
                                onDragEnd = { if (prize != null && cells.size.toFloat() / (GRID_W * GRID_H) > CLEAR_THRESHOLD) done = true },
                            )
                        },
                ) {
                    drawRect(Brush.linearGradient(listOf(Color(0xFF9AA7BD), Color(0xFFD6DEEA), Color(0xFFB7C2D4), Color(0xFF7F8CA3))))
                    val title = measurer.measure("RASCA AQUÍ", TextStyle(color = Color(0xFF1B2642), fontWeight = FontWeight.Bold, fontSize = 15.sp))
                    drawText(title, topLeft = Offset((size.width - title.size.width) / 2f, size.height / 2f - title.size.height - 2f))
                    val sub = measurer.measure("desliza el dedo para descubrir tu premio", TextStyle(color = Color(0xFF1B2642), fontSize = 12.sp))
                    drawText(sub, topLeft = Offset((size.width - sub.size.width) / 2f, size.height / 2f + 4f))
                    val radius = 26.dp.toPx()
                    strokes.forEach { drawCircle(Color.Black, radius, it, blendMode = BlendMode.Clear) }
                }
            }
        }
        error?.let { Text(it, color = Tech.Rose, style = MaterialTheme.typography.bodyMedium) }
    }
}

private fun cellOf(p: Offset, w: Int, h: Int): Int {
    val cx = (p.x / w * GRID_W).toInt().coerceIn(0, GRID_W - 1)
    val cy = (p.y / h * GRID_H).toInt().coerceIn(0, GRID_H - 1)
    return cy * GRID_W + cx
}
