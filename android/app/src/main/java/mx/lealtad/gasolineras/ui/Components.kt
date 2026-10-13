package mx.lealtad.gasolineras.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.lealtad.gasolineras.ui.theme.Tech

@Composable
fun GlassCard(modifier: Modifier = Modifier, accent: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Tech.Surface,
        border = BorderStroke(1.dp, if (accent) Tech.Cyan.copy(alpha = 0.55f) else Tech.Outline),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Tech.Muted)
}

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (enabled) Tech.Gradient else androidx.compose.ui.graphics.SolidColor(Tech.SurfaceHigh)),
    ) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                contentColor = Color.White,
                disabledContentColor = Tech.Muted,
            ),
        ) { Text(text, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
    }
}

@Composable
fun GhostButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Tech.Outline),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Tech.Ink, disabledContentColor = Tech.Muted, disabledContainerColor = Color.Transparent),
    ) { Text(text, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun Pill(text: String, color: Color = Tech.Cyan) {
    Text(
        text,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(color.copy(alpha = 0.16f))
            .padding(horizontal = 10.dp, vertical = 3.dp),
        color = color,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
fun BigNumber(value: String, label: String, alignEnd: Boolean = false) {
    Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start) {
        Text(value, fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Tech.Ink, lineHeight = 36.sp)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Tech.Muted)
    }
}

@Composable
fun StampsRow(stamps: Int, total: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { i ->
            Box(
                Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(if (i < stamps) Tech.Cyan else Color.Transparent)
                    .border(2.dp, if (i < stamps) Tech.Cyan else Tech.Outline, CircleShape),
            )
        }
    }
}

@Composable
fun TicketLine(label: String, value: String, strong: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontFamily = FontFamily.Monospace, fontSize = 13.sp, color = if (strong) Tech.Ink else Tech.Muted, fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal)
        Text(value, fontFamily = FontFamily.Monospace, fontSize = 13.sp, color = Tech.Ink, fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
fun Notice(text: String, color: Color) {
    Text(
        text,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(12.dp),
        color = color,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
fun RowScope.Spacer1() { androidx.compose.foundation.layout.Spacer(Modifier.weight(1f)) }

/** Barra de avance con texto arriba y, opcionalmente, un "3 de 5" a la derecha. */
@Composable
fun ProgressBar(text: String, fraction: Float, detail: String? = null, color: Color = Tech.Cyan) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(text, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            detail?.let { Text(it, color = color, fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp)) }
        }
        LinearProgressIndicator(
            progress = { fraction.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(999.dp)),
            color = color,
            trackColor = Tech.SurfaceHigh,
            strokeCap = StrokeCap.Round,
        )
    }
}

/** Fila de chips de selección única con el estilo de la app. Hace scroll horizontal si no cabe. */
@Composable
fun ChipRow(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, color: Color = Tech.Cyan) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (key, label) ->
            FilterChip(
                selected = selected == key,
                onClick = { onSelect(key) },
                label = { Text(label) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = color.copy(alpha = 0.2f), selectedLabelColor = color, labelColor = Tech.Ink),
            )
        }
    }
}
