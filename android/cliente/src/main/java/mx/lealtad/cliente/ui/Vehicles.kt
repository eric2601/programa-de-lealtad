package mx.lealtad.cliente.ui

import mx.lealtad.core.plate.PlateScanner
import mx.lealtad.core.plate.ScannerColors
import mx.lealtad.core.plate.Plate
import mx.lealtad.core.plate.PlateTag

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.lealtad.core.data.ApiException
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.Vehicle
import mx.lealtad.cliente.ui.theme.Turq

/** Vehículos del cliente: la placa lo identifica en la bomba igual que su celular. */
@Composable
fun VehiclesCard(vehicles: List<Vehicle>, api: LealtadApi, token: String, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    var plate by remember { mutableStateOf("") }
    val lang = LocalLang.current
    var scanning by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun run(block: suspend () -> Unit) {
        busy = true; error = null
        scope.launch {
            try { block(); onChanged() } catch (e: ApiException) { error = if (e.code == "NETWORK") NO_CONNECTION else e.message } catch (e: Exception) { error = NO_CONNECTION } finally { busy = false }
        }
    }

    Card {
        SectionTitle(tr("Mis vehículos"), tr("Con tu placa te identifican en la bomba, igual que con tu celular."))
        if (vehicles.isEmpty()) Text(tr("Todavía no agregas ninguno."), color = Turq.Muted)
        vehicles.forEach { v ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                PlateTag(v.plate, tr(v.kindLabel.ifBlank { Plate.KIND_LABELS[v.kind] ?: "Auto" }), Turq.AccentStrong)
                TextButton(enabled = !busy, onClick = { run { api.removeVehicle(token, v.id) } }) { Text(tr("Quitar"), color = Turq.Crit, fontWeight = FontWeight.Bold) }
            }
        }
        if (scanning) {
            PlateScanner(onPlate = { plate = it; scanning = false }, onClose = { scanning = false }, colors = ScannerColors(Turq.Accent, Turq.AccentStrong, Turq.Muted, Turq.Ink), text = { translate(lang, it) })
        } else {
            PrimaryButton(tr("Escanear placa con la cámara"), enabled = !busy) { scanning = true }
        }
        OutlinedTextField(
            value = plate, onValueChange = { plate = Plate.formatInput(it) }, label = { Text(tr("Placa (ABC-123-D, A01-ABC o 1234A5)")) }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii), modifier = Modifier.fillMaxWidth(),
            textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Turq.Accent, unfocusedBorderColor = Turq.LineStrong),
        )
        Plate.kindLabel(plate)?.let { Pill(tr(it)) }
        PrimaryButton(if (busy) tr("Guardando…") else tr("Agregar vehículo"), enabled = !busy && Plate.isComplete(plate)) { run { api.addVehicle(token, plate); plate = "" } }
        error?.let { Notice(tr(it)) }
    }
}
