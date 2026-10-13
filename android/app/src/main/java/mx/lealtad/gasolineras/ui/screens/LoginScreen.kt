package mx.lealtad.gasolineras.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.Session
import mx.lealtad.gasolineras.ui.GlassCard
import mx.lealtad.gasolineras.ui.Notice
import mx.lealtad.gasolineras.ui.PrimaryButton
import mx.lealtad.gasolineras.ui.theme.Tech

@Composable
fun LoginScreen(api: LealtadApi, baseUrl: String, onBaseUrlChange: (String) -> Unit, onLogin: (Session) -> Unit) {
    var stationCode by rememberSaveable { mutableStateOf("EST-01") }
    var pin by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf(baseUrl) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Entrar a la estación", style = MaterialTheme.typography.headlineMedium, color = Tech.Ink)
        Text("Cada persona entra con su NIP. Lo que registres queda a tu nombre en la auditoría.", color = Tech.Muted)
        GlassCard(accent = true) {
            OutlinedTextField(value = stationCode, onValueChange = { stationCode = it.uppercase() }, label = { Text("Código de estación") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                value = pin, onValueChange = { pin = it.filter(Char::isDigit).take(6) }, label = { Text("Tu NIP") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Notice(it, Tech.Rose) }
            PrimaryButton(if (busy) "Entrando…" else "Entrar", enabled = !busy && pin.length >= 4) {
                busy = true; error = null
                if (url != baseUrl) onBaseUrlChange(url)
                scope.launch {
                    try { onLogin(LealtadApi(url).login(stationCode, pin)) }
                    catch (e: Exception) { error = e.message }
                    finally { busy = false }
                }
            }
        }
        GlassCard {
            Text("Servidor", style = MaterialTheme.typography.titleMedium, color = Tech.Ink)
            OutlinedTextField(value = url, onValueChange = { url = it.trim() }, label = { Text("URL de la API") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("En el emulador, 10.0.2.2 es tu computadora. En un teléfono real usa la IP de tu red, por ejemplo http://192.168.1.20:8787.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        Text("Demo: estación EST-01, NIP 1111 (despachador) o 1234 (gerente).", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
    }
}
