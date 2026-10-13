package mx.lealtad.gasolineras.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.Session
import mx.lealtad.gasolineras.data.SessionStore
import mx.lealtad.gasolineras.ui.screens.IslaScreen
import mx.lealtad.gasolineras.ui.screens.LoginScreen
import mx.lealtad.gasolineras.ui.screens.ReportesScreen
import mx.lealtad.gasolineras.ui.theme.Tech

/** El portal del cliente vive en la app "Mis Puntos"; aquí solo la bomba y, para gerentes, reportes. */
enum class Tab(val label: String) { Isla("Isla"), Reportes("Reportes") }

@Composable
fun AppRoot() {
    val context = LocalContext.current
    val store = remember { SessionStore(context) }
    var baseUrl by remember { mutableStateOf(store.baseUrl) }
    val api = remember(baseUrl) { LealtadApi(baseUrl) }
    var session by remember { mutableStateOf(store.session) }
    var tab by remember { mutableStateOf(Tab.Isla) }

    fun setSession(s: Session?) { session = s; store.session = s }

    val canReports = session != null && session!!.user.role != "attendant"

    Scaffold(
        containerColor = Tech.Bg,
        topBar = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Tech.Bg)
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(Tech.Gradient))
                Column(Modifier.padding(start = 10.dp)) {
                    Text("Lealtad", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Tech.Ink)
                    Text(session?.let { "${it.tenant.name} · ${it.station.name}" } ?: "Gasolineras", style = MaterialTheme.typography.bodyMedium, color = Tech.Muted)
                }
                Spacer1()
                if (session != null) TextButton(onClick = { setSession(null) }) { Text("Salir", color = Tech.Cyan) }
            }
        },
        bottomBar = {
            // Un despachador solo tiene la bomba: sin barra. El gerente además ve reportes.
            if (session != null && canReports) NavigationBar(containerColor = Tech.Surface) {
                val items = listOf(Tab.Isla, Tab.Reportes)
                items.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = {
                            Icon(
                                when (t) { Tab.Isla -> Icons.Filled.Search; Tab.Reportes -> Icons.Filled.Info },
                                contentDescription = t.label,
                            )
                        },
                        label = { Text(t.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color.White, selectedTextColor = Tech.CyanDeep, indicatorColor = Tech.Cyan,
                            unselectedIconColor = Tech.Muted, unselectedTextColor = Tech.Muted,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            val s = session
            when {
                s == null -> LoginScreen(api, baseUrl, onBaseUrlChange = { baseUrl = it; store.baseUrl = it }, onLogin = { setSession(it) })
                tab == Tab.Isla -> IslaScreen(api, s, onExpired = { setSession(null) })
                tab == Tab.Reportes && canReports -> ReportesScreen(api, s)
                else -> IslaScreen(api, s, onExpired = { setSession(null) })
            }
        }
    }
}
