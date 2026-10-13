package mx.lealtad.gasolineras.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.Session
import mx.lealtad.core.data.Summary
import mx.lealtad.core.data.litros
import mx.lealtad.core.data.pesos
import mx.lealtad.gasolineras.ui.GlassCard
import mx.lealtad.gasolineras.ui.Notice
import mx.lealtad.gasolineras.ui.Pill
import mx.lealtad.gasolineras.ui.SectionLabel
import mx.lealtad.gasolineras.ui.Spacer1
import mx.lealtad.gasolineras.ui.theme.Tech

@Composable
private fun Line(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium)
        Spacer1()
        Text(value, fontFamily = FontFamily.Monospace, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun ReportesScreen(api: LealtadApi, session: Session) {
    var data by remember { mutableStateOf<Summary?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(session.token) { try { data = api.summary(session.token) } catch (e: Exception) { error = e.message } }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Últimos 30 días", style = MaterialTheme.typography.headlineMedium, color = Tech.Ink)
        error?.let { Notice(it, Tech.Rose) }
        val d = data ?: run { Text("Cargando…", color = Tech.Muted); return@Column }
        d.alerts.forEach { Notice("Alerta de concentración: ${it.detail}", Tech.Amber) }
        GlassCard(accent = true) {
            SectionLabel("Actividad identificada")
            Line("Cargas y ventas", d.totals.sales.toString())
            Line("Litros identificados", litros(d.totals.litersMl))
            Line("Venta de combustible", pesos(d.totals.fuelCents))
            Line("Venta de tienda", pesos(d.totals.storeCents))
            Line("Puntos emitidos", "${d.totals.pointsIssued} (${pesos(d.totals.pointsIssuedValueCents)})")
            Line("Puntos canjeados", d.totals.pointsRedeemed.toString())
            Line("Descuentos entregados", pesos(d.totals.rewardCents))
        }
        GlassCard {
            SectionLabel("Miembros")
            Line("Registrados", d.members.total.toString())
            Line("Activos a 30 días", d.members.active30.toString())
            Line("Activos a 90 días", d.members.active90.toString())
            Line("Pasivo de puntos", "${d.members.liabilityPoints} (${pesos(d.members.liabilityCents)})")
        }
        GlassCard {
            SectionLabel("Por estación")
            d.byStation.forEach { s ->
                Line("${s.code} · ${s.name}", "${s.sales} · ${litros(s.liters_ml)} · ${s.points} pts")
            }
        }
        GlassCard {
            SectionLabel("Conciliación por despachador")
            d.byAttendant.forEach { a ->
                val ratio = if (a.sales > 0) a.distinct_members.toDouble() / a.sales else 1.0
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Text(a.name, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium)
                        Text("${a.station ?: "—"} · ${a.sales} cargas · ${litros(a.liters_ml)} · ${a.distinct_members} números", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (a.sales > 0) Pill("${(ratio * 100).toInt()} %", if (ratio < 0.5 && a.sales >= 10) Tech.Rose else Tech.Mint)
                }
                HorizontalDivider(color = Tech.Outline)
            }
            Text("Concentración = números distintos ÷ cargas. Muchas cargas en pocos números se revisan con tickets físicos.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
