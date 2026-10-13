package mx.lealtad.cliente.ui

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import mx.lealtad.cliente.R
import mx.lealtad.core.data.PortalPromotion
import mx.lealtad.cliente.ui.theme.Turq

/** Tarjeta blanca con borde fino, como en la web. */
@Composable
fun Card(modifier: Modifier = Modifier, accent: Boolean = false, padding: Dp = 16.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Turq.Surface)
            .border(1.dp, if (accent) Turq.Accent.copy(alpha = .5f) else Turq.Line, RoundedCornerShape(18.dp))
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable
fun SectionTitle(text: String, sub: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium, color = Turq.Ink)
        if (sub != null) Text(sub, color = Turq.Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun Pill(text: String, color: Color = Turq.AccentStrong, bg: Color = Turq.AccentSoft) {
    Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(bg).padding(horizontal = 9.dp, vertical = 3.dp))
}

@Composable
fun Notice(text: String, color: Color = Turq.Crit, bg: Color = Turq.CritSoft) {
    Text(text, color = color, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg).padding(12.dp), style = MaterialTheme.typography.bodyMedium)
}

/** Píldora ES | EN para cambiar el idioma de la app. */
@Composable
fun LangToggle(lang: Lang, onChange: (Lang) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.clip(CircleShape).background(Turq.Surface2).border(1.dp, Turq.Line, CircleShape).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Lang.entries.forEach { l ->
            val on = l == lang
            Text(
                l.name, color = if (on) Color.White else Turq.Ink2, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
                modifier = Modifier.clip(CircleShape).background(if (on) Turq.Accent else Color.Transparent).clickable { onChange(l) }.padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
fun PrimaryButton(text: String, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.fillMaxWidth().height(56.dp), shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = Turq.Accent, contentColor = Color.White, disabledContainerColor = Turq.Accent.copy(alpha = .4f), disabledContentColor = Color.White)) {
        Text(text, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
    }
}

/** Pictograma de la lámina, pintado con el color indicado. */
@Composable
fun Picto(@DrawableRes res: Int, size: Dp = 26.dp, color: Color = Turq.Accent, modifier: Modifier = Modifier) {
    Image(painterResource(res), contentDescription = null, modifier = modifier.size(size), colorFilter = ColorFilter.tint(color))
}

/** Icono redondo con fondo suave. */
@Composable
fun PictoBadge(@DrawableRes res: Int, size: Dp = 64.dp, color: Color = Turq.Accent, bg: Color = Turq.AccentSoft) {
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) { Picto(res, size = size * 0.52f, color = color) }
}

/** Anillo de progreso con la cifra al centro. */
@Composable
fun Ring(value: Float, max: Float, label: String, sub: String, size: Dp = 104.dp, color: Color = Turq.Accent) {
    val target = if (max > 0f) (value / max).coerceIn(0f, 1f) else 0f
    val p by animateFloatAsState(target, animationSpec = tween(800), label = "ring")
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = 9.dp.toPx()
            val inset = stroke / 2
            drawArc(Turq.Surface3, -90f, 360f, false, topLeft = Offset(inset, inset), size = Size(this.size.width - stroke, this.size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(color, -90f, 360f * p, false, topLeft = Offset(inset, inset), size = Size(this.size.width - stroke, this.size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 22.sp, color = Turq.Ink)
            Text(sub.uppercase(), fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold, color = Turq.Muted)
        }
    }
}

/** Barra de avance con montos a los lados. */
@Composable
fun ProgressBar(current: Long, target: Long, unit: String) {
    if (unit == "visits") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            repeat(target.toInt().coerceIn(1, 12)) { i ->
                Box(Modifier.size(16.dp).clip(CircleShape).background(if (i < current) Turq.Accent else Color.Transparent).border(2.dp, if (i < current) Turq.Accent else Turq.LineStrong, CircleShape))
            }
            Text("${current.coerceAtMost(target)}/$target", color = Turq.Muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
        }
        return
    }
    val f = if (target > 0) (current.toFloat() / target).coerceIn(0f, 1f) else 0f
    val p by animateFloatAsState(f, animationSpec = tween(700), label = "bar")
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(Turq.Surface3)) {
            Box(Modifier.fillMaxWidth(p).height(8.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Turq.Accent, Turq.AccentStrong))))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(money(current.coerceAtMost(target)), fontSize = 11.sp, color = Turq.Muted, fontFamily = FontFamily.Monospace)
            Text(money(target), fontSize = 11.sp, color = Turq.Muted, fontFamily = FontFamily.Monospace)
        }
    }
}

/** Carrusel con los diez carteles: avanza solo cada 3 s y se detiene un rato cuando el cliente lo toca. */
@Composable
fun PosterSlider(promos: List<PortalPromotion>, onOpen: () -> Unit) {
    val items = remember(promos) { POSTERS.map { art -> art to promos.firstOrNull { posterFor(it) == art } } }
    val state = rememberLazyListState()
    var idx by remember { mutableIntStateOf(0) }
    LaunchedEffect(state) { snapshotFlow { state.firstVisibleItemIndex }.collect { idx = it % items.size } }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            if (state.isScrollInProgress) continue
            val next = (state.firstVisibleItemIndex + 1) % items.size
            state.animateScrollToItem(next)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LazyRow(state = state, horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(horizontal = 2.dp)) {
            itemsIndexed(items) { _, (art, promo) ->
                Box(
                    Modifier.width(220.dp).aspectRatio(0.4f).clip(RoundedCornerShape(18.dp)).border(1.dp, Turq.Line, RoundedCornerShape(18.dp)).clickable(onClick = onOpen),
                ) {
                    Image(painterResource(art.res), contentDescription = promo?.name ?: tr(art.title), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth())
                    Column(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xD90C1628)))).padding(start = 12.dp, end = 12.dp, top = 36.dp, bottom = 12.dp),
                    ) {
                        Text(promo?.benefitLabel ?: tr(art.title), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(promo?.name ?: tr(art.caption), color = Color.White.copy(alpha = .85f), fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            items.forEachIndexed { i, _ ->
                Box(Modifier.padding(horizontal = 2.dp).height(7.dp).width(if (i == idx) 20.dp else 7.dp).clip(CircleShape).background(if (i == idx) Turq.Accent else Turq.LineStrong))
            }
        }
    }
}

@Composable
fun PosterThumb(@DrawableRes res: Int, width: Dp = 56.dp) {
    Image(painterResource(res), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.width(width).aspectRatio(0.4f).clip(RoundedCornerShape(10.dp)).border(1.dp, Turq.Line, RoundedCornerShape(10.dp)))
}

@Composable
fun androidx.compose.foundation.layout.RowScope.Spacer1() { Spacer(Modifier.weight(1f)) }

/** Referencias a los pictogramas por nombre (misma numeración que web/public/pictos). */
object Pictos {
    val pump = R.drawable.picto_01; val carFuel = R.drawable.picto_02; val gift = R.drawable.picto_03; val tag = R.drawable.picto_04; val card = R.drawable.picto_05
    val store = R.drawable.picto_06; val wash = R.drawable.picto_07; val tire = R.drawable.picto_08; val tools = R.drawable.picto_09; val ev = R.drawable.picto_10
    val coins = R.drawable.picto_11; val map = R.drawable.picto_12; val userStar = R.drawable.picto_13; val bell = R.drawable.picto_14; val chart = R.drawable.picto_15
}
